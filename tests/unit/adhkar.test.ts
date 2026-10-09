import { readFileSync } from 'node:fs';
import path from 'node:path';
import { IDBFactory, IDBKeyRange } from 'fake-indexeddb';
import { describe, expect, it } from 'vitest';
import { buildAdhkar, overlap, type QuranMapping } from '../../scripts/adhkar/build.ts';
import { verifyAdhkar } from '../../scripts/adhkar/verify.ts';
import { loadApproved } from '../../scripts/quran/sources.ts';
import { openLocalStore } from '@/lib/store/dexie';
import { planMerge } from '@/lib/store/merge';
import type { SearchIndexFile } from '@/lib/quran/types';
import type { AdhkarCategoryFile } from '@/lib/adhkar/types';

const root = process.cwd();
const json = <T,>(p: string) => JSON.parse(readFileSync(path.join(root, p), 'utf8')) as T;

describe('adhkar content (SPEC §7.14, D-055)', async () => {
  const checks = await verifyAdhkar();
  it.each(checks.map((c) => [c.id, c] as const))('%s', (_id, c) => expect(c.ok, c.detail).toBe(true));

  it('every dhikr has text, a count and a reference; Quranic passages are ayah references', () => {
    const morning = json<AdhkarCategoryFile>('content/adhkar/morning.json');
    expect(morning.items.every((d) => d.count > 0 && d.reference.ar.length > 0 && d.parts.length > 0)).toBe(true);
    const kursi = morning.items.find((d) => d.order === 2)!;
    expect(kursi.parts.map((p) => p.kind)).toEqual(['text', 'quran']);
    expect(kursi.parts[1]).toEqual({ kind: 'quran', surah: 2, from: 255, to: 255 });
  });

  it('a wrong Quran mapping stops the import', async () => {
    const [ar, en] = [await loadApproved('adhkar-seen-arabic-ar'), await loadApproved('adhkar-seen-arabic-en')];
    const search = json<SearchIndexFile>('content/search/index.json');
    const mapping = json<QuranMapping>('data/curated/adhkar-quran.json');
    const wrong: QuranMapping = { items: { ...mapping.items, '4': { split: 'whole', ayahs: { surah: 113, from: 1, to: 5 } } } };
    expect(() => buildAdhkar(ar, en, wrong, search)).toThrow(/does not match/);
    const missing: QuranMapping = { items: { ...mapping.items } };
    delete missing.items['2'];
    expect(() => buildAdhkar(ar, en, missing, search)).toThrow(/no mapping/);
  });

  it('overlap measures shared normalized words', () => {
    expect(overlap('قُلْ هُوَ اللَّهُ أَحَدٌ', 'قل هو الله أحد')).toBe(1);
    expect(overlap('شيء آخر', 'قل هو الله أحد')).toBe(0);
  });
});

describe('adhkar days and tasbih in the local store', () => {
  let i = 0;
  const open = () => openLocalStore({ name: `adhkar-${++i}`, indexedDB: new IDBFactory(), IDBKeyRange });

  it('saves counts per day and category, with the completed flag', async () => {
    const store = await open();
    await store.adhkar.setCount('2026-10-09', 'morning', 'morning:1', 1, false);
    await store.adhkar.setCount('2026-10-09', 'morning', 'morning:2', 3, true);
    expect(await store.adhkar.get('2026-10-09', 'morning')).toMatchObject({ counts: { 'morning:1': 1, 'morning:2': 3 }, completed: true });
    // A new day starts empty.
    expect(await store.adhkar.get('2026-10-10', 'morning')).toBeUndefined();
    await expect(store.adhkar.setCount('2026-10-09', 'morning', 'bad id', 1, false)).rejects.toThrow();
    store.close();
  });

  it('tasbih: one running session, history newest first', async () => {
    const store = await open();
    const a = await store.tasbih.start('x', 33);
    await store.tasbih.update(a.id, { count: 10 });
    const b = await store.tasbih.start('y', null);
    expect((await store.tasbih.current())?.id).toBe(b.id);
    const history = await store.tasbih.history();
    expect(history.map((h) => h.id)).toEqual([b.id, a.id]);
    expect(history[1]).toMatchObject({ count: 10, target: 33 });
    expect(history[1]!.endedAt).not.toBeNull();
    store.close();
  });

  it('adhkar days merge by max count per dhikr; completed stays completed', () => {
    const base = { createdAt: 1, deletedAt: null, date: '2026-10-09', categoryId: 'morning' };
    const local = { ...base, id: 'l', updatedAt: 5, counts: { 'morning:1': 3, 'morning:2': 1 }, completed: true };
    const remote = { ...base, id: 'r', updatedAt: 9, counts: { 'morning:1': 1, 'morning:3': 7 }, completed: false };
    const plan = planMerge('adhkarDays', remote, [local], () => 100);
    expect(plan.drop).toEqual(['l']);
    expect(plan.push[0]).toMatchObject({ id: 'r', counts: { 'morning:1': 3, 'morning:2': 1, 'morning:3': 7 }, completed: true });
  });
});
