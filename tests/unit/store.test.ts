import { IDBFactory, IDBKeyRange } from 'fake-indexeddb';
import { afterEach, describe, expect, it } from 'vitest';
import { HybridClock } from '@/lib/store/clock';
import { openLocalStore } from '@/lib/store/dexie';
import { combineNoteBodies, newer, planMerge } from '@/lib/store/merge';
import { isValidItemRef, localDate, uuidv4 } from '@/lib/store/refs';
import type { LocalStore } from '@/lib/store/repository';
import type { NoteRecord, ReadingDayRecord, SavedItemRecord, SyncRecord } from '@/lib/store/types';

const base = (id: string, updatedAt: number, extra: Partial<SyncRecord> = {}): SyncRecord => ({
  id,
  createdAt: updatedAt,
  updatedAt,
  deletedAt: null,
  ...extra,
});
const day = (id: string, updatedAt: number, date: string, pagesRead: number[], secondsRead: number): ReadingDayRecord => ({
  ...base(id, updatedAt),
  date,
  pagesRead,
  secondsRead,
});
const saved = (id: string, updatedAt: number, ref: string, collectionId: string | null = null): SavedItemRecord => ({
  ...base(id, updatedAt),
  type: 'AYAH',
  ref,
  collectionId,
});
const note = (id: string, createdAt: number, body: string, updatedAt = createdAt): NoteRecord => ({
  ...base(id, updatedAt, { createdAt }),
  targetType: 'AYAH',
  targetRef: '2:255',
  body,
});
let stamp = 10_000;
const nextStamp = () => ++stamp;

describe('hybrid clock (D-016)', () => {
  it('is monotonic even when the wall clock goes back', () => {
    let wall = 1000;
    const clock = new HybridClock(0, () => wall);
    expect(clock.now()).toBe(1000);
    expect(clock.now()).toBe(1001);
    wall = 500;
    expect(clock.now()).toBe(1002);
    clock.observe(5000);
    expect(clock.now()).toBe(5001);
  });
});

describe('merge rules (SPEC §5, D-043)', () => {
  it('last write wins by updatedAt, ties broken the same way on every device', () => {
    const a = saved('x', 5, '1:1', 'c1');
    const b = saved('x', 6, '1:1', 'c2');
    expect(newer(a, b)).toBe(b);
    const c = saved('x', 6, '1:1', 'c3');
    expect(newer(b, c)).toBe(newer(c, b));
  });

  it('accepts a newer remote record and ignores an older one', () => {
    const local = saved('x', 10, '1:1', 'c1');
    expect(planMerge('savedItems', saved('x', 11, '1:1', 'c2'), [local], nextStamp).accept).toHaveLength(1);
    expect(planMerge('savedItems', saved('x', 9, '1:1', 'c2'), [local], nextStamp)).toEqual({ accept: [], push: [], drop: [] });
  });

  it('a newer tombstone deletes, an older one does not', () => {
    const local = saved('x', 10, '1:1');
    const dead = { ...saved('x', 11, '1:1'), deletedAt: 11 };
    expect(planMerge('savedItems', dead, [local], nextStamp).accept[0]?.deletedAt).toBe(11);
    expect(planMerge('savedItems', { ...dead, updatedAt: 9 }, [local], nextStamp).accept).toEqual([]);
  });

  it('reading days merge by union of pages and max of seconds, adopting the server id', () => {
    const local = day('local', 50, '2026-10-06', [3, 1], 600);
    const remote = day('server', 40, '2026-10-06', [2, 3], 300);
    const plan = planMerge('readingDays', remote, [local], nextStamp);
    expect(plan.drop).toEqual(['local']);
    expect(plan.accept).toEqual([]);
    expect(plan.push).toHaveLength(1);
    expect(plan.push[0]).toMatchObject({ id: 'server', date: '2026-10-06', pagesRead: [1, 2, 3], secondsRead: 600 });
    expect(plan.push[0]!.updatedAt).toBeGreaterThan(50);
  });

  it('a reading day that already contains everything is accepted as is', () => {
    const local = day('server', 40, '2026-10-06', [1], 100);
    const remote = day('server', 60, '2026-10-06', [1, 2], 300);
    expect(planMerge('readingDays', remote, [local], nextStamp)).toEqual({ accept: [remote], push: [], drop: [] });
  });

  it('singletons keep one record with the server id; the newer content wins', () => {
    const local = { ...base('mine', 90), surah: 2, ayah: 255, page: 42, mode: 'READING' as const };
    const remote = { ...base('theirs', 80), surah: 18, ayah: 10, page: 294, mode: 'MUSHAF' as const };
    const plan = planMerge('readingPositions', remote, [local], nextStamp);
    expect(plan.drop).toEqual(['mine']);
    expect(plan.push).toEqual([{ ...local, id: 'theirs' }]);

    const newerRemote = { ...remote, updatedAt: 95 };
    expect(planMerge('readingPositions', newerRemote, [local], nextStamp)).toEqual({ accept: [newerRemote], push: [], drop: ['mine'] });
  });

  it('the same ayah saved on two devices is folded into one record (smallest id)', () => {
    const mine = saved('b-id', 20, '2:255', 'c-new');
    const theirs = saved('a-id', 10, '2:255', null);
    const plan = planMerge('savedItems', theirs, [mine], nextStamp);
    const canonical = plan.push.find((r) => r.id === 'a-id');
    const loser = plan.push.find((r) => r.id === 'b-id');
    expect(canonical).toMatchObject({ deletedAt: null, collectionId: 'c-new', createdAt: 10 });
    expect(loser?.deletedAt).not.toBeNull();
    expect(plan.accept).toEqual([]);

    // The other device, receiving b-id, reaches the same result.
    const mirror = planMerge('savedItems', mine, [theirs], nextStamp);
    expect(mirror.push.find((r) => r.id === 'a-id')).toMatchObject({ deletedAt: null, collectionId: 'c-new' });
    expect(mirror.push.find((r) => r.id === 'b-id')?.deletedAt).not.toBeNull();
  });

  it('two different notes on the same ayah are both kept, oldest first', () => {
    expect(combineNoteBodies([note('b', 20, 'second'), note('a', 10, 'first')])).toBe('first\n\nsecond');
    expect(combineNoteBodies([note('a', 10, 'draft'), note('b', 20, 'draft, finished')])).toBe('draft, finished');
    const plan = planMerge('notes', note('z', 5, 'remote'), [note('y', 7, 'local')], nextStamp);
    expect(plan.push.find((r) => r.id === 'y')).toMatchObject({ body: 'remote\n\nlocal', deletedAt: null });
    expect(plan.push.find((r) => r.id === 'z')?.deletedAt).not.toBeNull();
  });

  it('collections merge by id only', () => {
    const local = { ...base('c1', 10), name: 'Important', order: 0 };
    const remote = { ...base('c2', 5), name: 'Important', order: 0 };
    expect(planMerge('collections', remote, [local], nextStamp)).toEqual({ accept: [remote], push: [], drop: [] });
  });
});

describe('references and ids', () => {
  it('validates item references', () => {
    expect(isValidItemRef('AYAH', '2:255')).toBe(true);
    expect(isValidItemRef('AYAH', '115:1')).toBe(false);
    expect(isValidItemRef('AYAH', '2:0')).toBe(false);
    expect(isValidItemRef('PAGE', '604')).toBe(true);
    expect(isValidItemRef('PAGE', '605')).toBe(false);
    expect(isValidItemRef('SURAH', '18')).toBe(true);
    expect(isValidItemRef('SURAH', '18:1')).toBe(false);
  });

  it('generates RFC 4122 v4 UUIDs and local dates', () => {
    expect(uuidv4()).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    expect(localDate(new Date(2026, 0, 5, 23, 59).getTime())).toBe('2026-01-05');
  });
});

describe('Dexie store (fake-indexeddb)', () => {
  let store: LocalStore;
  let counter = 0;
  const open = async (name = `test-${++counter}`, wallClock?: () => number) =>
    (store = await openLocalStore({ name, indexedDB: new IDBFactory(), IDBKeyRange, wallClock }));

  afterEach(() => store?.close());

  it('records have the sync-ready shape and every write is queued for upload', async () => {
    await open();
    const item = await store.saved.save('AYAH', '2:255');
    expect(item.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(item).toMatchObject({ type: 'AYAH', ref: '2:255', collectionId: null, deletedAt: null });
    expect(item.updatedAt).toBeGreaterThan(0);
    const pending = await store.sync.pending();
    expect(pending).toEqual([{ table: 'savedItems', record: item }]);
    await store.sync.acknowledge(pending);
    expect(await store.sync.pending()).toEqual([]);
  });

  it('saving is idempotent, removing leaves a tombstone, saving again revives it', async () => {
    await open();
    const first = await store.saved.save('AYAH', '1:1');
    expect((await store.saved.save('AYAH', '1:1')).id).toBe(first.id);
    await store.saved.remove(first.id);
    expect(await store.saved.list()).toEqual([]);
    const [queued] = await store.sync.pending();
    expect(queued?.record.deletedAt).not.toBeNull();
    const again = await store.saved.save('AYAH', '1:1');
    expect(again.id).toBe(first.id);
    expect(again.deletedAt).toBeNull();
  });

  it('rejects invalid input', async () => {
    await open();
    await expect(store.saved.save('AYAH', '2:999')).rejects.toThrow(/Invalid/);
    await expect(store.collections.create('   ')).rejects.toThrow(/name/);
    await expect(store.notes.set('AYAH', '1:1', 'x'.repeat(5001))).rejects.toThrow(/long/);
    await expect(store.saved.save('AYAH', '1:1', 'no-such-collection')).rejects.toThrow(/collection/);
  });

  it('collections: order, move, rename; deleting one keeps its items saved', async () => {
    await open();
    const a = await store.collections.create('Important');
    const b = await store.collections.create(' To memorize ');
    expect((await store.collections.list()).map((c) => c.name)).toEqual(['Important', 'To memorize']);
    await store.collections.move(b.id, -1);
    expect((await store.collections.list()).map((c) => c.name)).toEqual(['To memorize', 'Important']);
    await store.collections.rename(a.id, 'Favourites');
    const item = await store.saved.save('PAGE', '50', a.id);
    expect(item.collectionId).toBe(a.id);
    await store.collections.remove(a.id);
    expect((await store.collections.list()).map((c) => c.name)).toEqual(['To memorize']);
    expect((await store.saved.find('PAGE', '50'))?.collectionId).toBeNull();
  });

  it('notes: one per target, independent of saving; an empty body deletes', async () => {
    await open();
    const n = await store.notes.set('AYAH', '2:255', '  my note  ');
    expect(n?.body).toBe('my note');
    expect((await store.notes.set('AYAH', '2:255', 'edited'))?.id).toBe(n?.id);
    expect(await store.saved.find('AYAH', '2:255')).toBeUndefined();
    expect(await store.notes.set('AYAH', '2:255', '')).toBeUndefined();
    expect(await store.notes.get('AYAH', '2:255')).toBeUndefined();
  });

  it('preferences: one record, shallow-merged, no write when nothing changes', async () => {
    await open();
    expect(await store.preferences.get()).toBeUndefined();
    await store.preferences.update({ theme: 'sepia' });
    await store.sync.acknowledge(await store.sync.pending());
    await store.preferences.update({ theme: 'sepia' });
    expect(await store.sync.pending()).toEqual([]);
    const reader = { font: 'scheherazade', size: 34, lineHeight: 2.2, width: 'normal', numerals: 'western', translation: null } as const;
    expect(await store.preferences.update({ reader })).toEqual({ theme: 'sepia', reader });
  });

  it('reading position: a single record, updated in place', async () => {
    await open();
    await store.position.set({ surah: 2, ayah: 255, page: 42, mode: 'READING' });
    const first = await store.position.get();
    await store.position.set({ surah: 18, ayah: 10, page: 294, mode: 'MUSHAF' });
    const second = await store.position.get();
    expect(second).toMatchObject({ id: first?.id, surah: 18, ayah: 10, page: 294, mode: 'MUSHAF' });
    await expect(store.position.set({ surah: 2, ayah: 300, page: 42, mode: 'READING' })).rejects.toThrow();
  });

  it('reading days: pages counted once per day, seconds added', async () => {
    await open();
    await store.readingDays.record('2026-10-06', { pages: [3], seconds: 20 });
    await store.readingDays.record('2026-10-06', { pages: [3, 4], seconds: 10 });
    await store.readingDays.record('2026-10-07', { seconds: 5 });
    expect(await store.readingDays.get('2026-10-06')).toMatchObject({ pagesRead: [3, 4], secondsRead: 30 });
    expect((await store.readingDays.list('2026-10-07')).map((d) => d.date)).toEqual(['2026-10-07']);
  });

  it('notifies subscribers after a write commits', async () => {
    await open();
    const calls: string[] = [];
    const off = store.subscribe(['savedItems'], () => calls.push('saved'));
    store.subscribe(['notes'], () => calls.push('notes'));
    await store.saved.save('SURAH', '18');
    off();
    await store.saved.save('SURAH', '19');
    expect(calls).toEqual(['saved']);
  });

  it('applyRemote merges with the rules and the clock moves past remote timestamps', async () => {
    await open(undefined, () => 1000);
    await store.readingDays.record('2026-10-06', { pages: [1], seconds: 100 });
    await store.sync.applyRemote([
      { table: 'readingDays', record: day('server-day', 5000, '2026-10-06', [2], 50) },
      { table: 'savedItems', record: saved('remote-item', 6000, '2:255') },
    ]);
    const merged = await store.readingDays.get('2026-10-06');
    expect(merged).toMatchObject({ id: 'server-day', pagesRead: [1, 2], secondsRead: 100 });
    expect(merged!.updatedAt).toBeGreaterThan(5000);
    expect((await store.saved.find('AYAH', '2:255'))?.id).toBe('remote-item');
    // Only the merged day needs uploading; the accepted remote item does not.
    const pending = await store.sync.pending();
    expect(pending.map((c) => `${c.table}:${c.record.id}`)).toEqual(['readingDays:server-day']);
    // A local edit after seeing remote data gets a later timestamp although the wall clock is behind.
    const local = await store.saved.save('AYAH', '1:1');
    expect(local.updatedAt).toBeGreaterThan(6000);
  });

  it('the clock survives reopening the database', async () => {
    const name = `clock-${++counter}`;
    const idb = new IDBFactory();
    let s = await openLocalStore({ name, indexedDB: idb, IDBKeyRange, wallClock: () => 1000 });
    await s.sync.applyRemote([{ table: 'savedItems', record: saved('r', 9000, '3:1') }]);
    s.close();
    s = store = await openLocalStore({ name, indexedDB: idb, IDBKeyRange, wallClock: () => 1000 });
    expect((await s.saved.save('AYAH', '3:2')).updatedAt).toBeGreaterThan(9000);
  });
});
