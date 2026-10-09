import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { PGlite } from '@electric-sql/pglite';
import { PGLiteSocketServer } from '@electric-sql/pglite-socket';
import { PrismaPg } from '@prisma/adapter-pg';
import { IDBFactory, IDBKeyRange } from 'fake-indexeddb';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PrismaClient } from '../../src/generated/prisma/client.ts';
import { openLocalStore } from '@/lib/store/dexie';
import type { LocalStore } from '@/lib/store/repository';
import { syncStore, type Transport } from '@/lib/sync/client';
import { parseSyncRequest } from '@/lib/sync/protocol';
import { exportUserData, handleSync } from '@/lib/sync/server';

// Sync end to end (SPEC §5, §15 "sync merge and conflict rules"): two devices with real local
// stores (fake-indexeddb) sync through the real server code and Postgres (PGlite + migrations).

let pg: PGlite;
let server: PGLiteSocketServer;
let prisma: PrismaClient;

beforeAll(async () => {
  pg = new PGlite();
  const dir = path.join(process.cwd(), 'prisma', 'migrations');
  for (const m of readdirSync(dir, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name).sort()) {
    await pg.exec(readFileSync(path.join(dir, m, 'migration.sql'), 'utf8'));
  }
  await pg.exec(`INSERT INTO "user" (id, name, email) VALUES ('u1', '', 'one@example.com'), ('u2', '', 'two@example.com')`);
  server = new PGLiteSocketServer({ db: pg, port: 0, host: '127.0.0.1', maxConnections: 4 });
  await server.start();
  prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: `postgresql://postgres:postgres@${server.getServerConn()}/postgres?sslmode=disable`, max: 1 }) });
}, 60_000);

afterAll(async () => {
  await prisma?.$disconnect();
  await server?.stop();
  await pg?.close();
});

let n = 0;
const device = () => openLocalStore({ name: `sync-${++n}`, indexedDB: new IDBFactory(), IDBKeyRange });
/** Goes through JSON and the request validation, like the HTTP route. */
const transport =
  (userId: string): Transport =>
  async (req) => {
    const parsed = parseSyncRequest(JSON.parse(JSON.stringify(req)));
    if (!parsed) throw new Error('invalid request');
    return JSON.parse(JSON.stringify(await handleSync(prisma, userId, parsed)));
  };
const sync = (store: LocalStore, user = 'u1') => syncStore(store, transport(user));

describe('sync (SPEC §5)', () => {
  it('guest data on one device reaches a second device of the same account', async () => {
    const a = await device();
    const c = await a.collections.create('Important');
    await a.saved.save('AYAH', '2:255', c.id);
    await a.notes.set('AYAH', '2:255', 'Ayat al-Kursi');
    await a.position.set({ surah: 18, ayah: 10, page: 294, mode: 'READING' });
    await sync(a);
    expect(await a.sync.pending()).toEqual([]);

    const b = await device();
    await sync(b);
    expect((await b.saved.find('AYAH', '2:255'))?.collectionId).toBe(c.id);
    expect((await b.notes.get('AYAH', '2:255'))?.body).toBe('Ayat al-Kursi');
    expect(await b.position.get()).toMatchObject({ surah: 18, ayah: 10 });
    a.close();
    b.close();
  });

  it('last write wins; deletions travel as tombstones', async () => {
    const a = await device();
    const b = await device();
    await sync(a);
    await sync(b);
    await a.notes.set('AYAH', '1:1', 'first');
    await sync(a);
    await sync(b);
    await b.notes.set('AYAH', '1:1', 'edited on b');
    await sync(b);
    await sync(a);
    expect((await a.notes.get('AYAH', '1:1'))?.body).toBe('edited on b');

    const item = await a.saved.save('PAGE', '50');
    await sync(a);
    await sync(b);
    await b.saved.remove((await b.saved.find('PAGE', '50'))!.id);
    await sync(b);
    await sync(a);
    expect(await a.saved.find('PAGE', '50')).toBeUndefined();
    expect(item.id).toBeTruthy();
    a.close();
    b.close();
  });

  it('reading days merge by union of pages and max of seconds; one row per date on the server', async () => {
    const a = await device();
    const b = await device();
    await a.readingDays.record('2026-10-09', { pages: [1, 2], seconds: 300 });
    await b.readingDays.record('2026-10-09', { pages: [3], seconds: 500 });
    await sync(a);
    await sync(b);
    await sync(a);
    for (const s of [a, b]) expect(await s.readingDays.get('2026-10-09')).toMatchObject({ pagesRead: [1, 2, 3], secondsRead: 500 });
    const rows = await prisma.readingDay.findMany({ where: { userId: 'u1', date: new Date('2026-10-09T00:00:00Z') } });
    expect(rows).toHaveLength(1);
    a.close();
    b.close();
  });

  it('preferences stay one record per user, newest wins', async () => {
    const a = await device();
    const b = await device();
    await a.preferences.update({ theme: 'sepia' });
    await sync(a);
    await b.preferences.update({ theme: 'dark' });
    await sync(b);
    await sync(a);
    expect((await a.preferences.get())?.theme).toBe('dark');
    expect(await prisma.userPreferences.count({ where: { userId: 'u1' } })).toBe(1);
    a.close();
    b.close();
  });

  it('users are isolated: another user sees nothing and cannot overwrite', async () => {
    const other = await device();
    await sync(other, 'u2');
    expect(await other.saved.list()).toEqual([]);
    // A forged change with u1's record id is ignored.
    const u1Note = await prisma.note.findFirst({ where: { userId: 'u1' } });
    await transport('u2')({
      cursor: null,
      changes: [{ table: 'notes', record: { id: u1Note!.id, createdAt: 1, updatedAt: Date.now() + 1e9, deletedAt: null, targetType: 'AYAH', targetRef: '1:1', body: 'hijack' } }],
    });
    expect((await prisma.note.findUnique({ where: { id: u1Note!.id } }))?.userId).toBe('u1');
    expect((await prisma.note.findUnique({ where: { id: u1Note!.id } }))?.body).not.toBe('hijack');
    other.close();
  });

  it('memorization (one row per ayah) and goals (one per start date) sync and merge by natural key', async () => {
    const a = await device();
    const b = await device();
    await a.memorization.add(67, [1, 2]);
    await b.memorization.add(67, [2, 3]); // 67:2 added on both devices with different ids
    await a.goals.set(5, '2026-10-09');
    // Later write wins. Two writes in the same millisecond tie and are broken by content (merge.ts),
    // which is deterministic but not "later" — so make the second write clearly later.
    await new Promise((resolve) => setTimeout(resolve, 5));
    await b.goals.set(10, '2026-10-09');
    await sync(a);
    await sync(b);
    await sync(a);
    for (const s of [a, b]) {
      expect((await s.memorization.list()).map((x) => x.ayah)).toEqual([1, 2, 3]);
      expect((await s.goals.list()).map((g) => g.amount)).toEqual([10]);
    }
    expect(await prisma.memorizationItem.count({ where: { userId: 'u1', surah: 67 } })).toBe(3);
    expect(await prisma.goal.count({ where: { userId: 'u1' } })).toBe(1);

    await b.memorization.review(67, 2, 'good');
    await sync(b);
    await sync(a);
    expect((await a.memorization.list()).find((x) => x.ayah === 2)).toMatchObject({ repetitions: 1, status: 'REVIEWING' });
    a.close();
    b.close();
  });

  it('after "Delete my account" the device data becomes guest data and can go into a new account', async () => {
    await pg.exec(`INSERT INTO "user" (id, name, email) VALUES ('u3', '', 'three@example.com'), ('u4', '', 'four@example.com')`);
    const a = await device();
    await a.saved.save('SURAH', '36');
    const removed = await a.saved.save('SURAH', '67');
    await a.saved.remove(removed.id);
    await sync(a, 'u3');
    expect(await a.sync.pending()).toEqual([]);
    await prisma.user.delete({ where: { id: 'u3' } }); // cascades to the user's data
    expect(await prisma.savedItem.count({ where: { userId: 'u3' } })).toBe(0);

    await a.sync.detach();
    expect(await a.sync.getCursor()).toBeNull();
    const pending = await a.sync.pending();
    expect(pending.every((c) => c.record.deletedAt === null)).toBe(true);
    expect(pending.some((c) => c.table === 'savedItems')).toBe(true);
    await sync(a, 'u4');
    expect((await prisma.savedItem.findMany({ where: { userId: 'u4' } })).map((r) => r.ref)).toEqual(['36']);
    a.close();
  });

  it('rejects invalid requests and exports a user’s data', async () => {
    expect(parseSyncRequest({ cursor: 'x', changes: [] })).toBeNull();
    expect(parseSyncRequest({ cursor: null, changes: [{ table: 'savedItems', record: { id: 'not-a-uuid' } }] })).toBeNull();
    const data = await exportUserData(prisma, 'u1');
    expect(data.savedItems.length).toBeGreaterThan(0);
    expect(data.notes.every((x) => typeof x.updatedAt === 'number')).toBe(true);
  });
});
