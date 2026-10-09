// IndexedDB implementation of the local store (Dexie). Loaded lazily through getStore(), so the
// ~30 KB of Dexie never weighs on the first paint of a route (D-048).
//
// Every write runs in one transaction that also records the changed record in `outbox` (the
// upload queue for Phase 9) and persists the hybrid clock. Listeners in this tab are called after
// the transaction commits, other tabs hear about it through a BroadcastChannel.

import Dexie, { type Table } from 'dexie';
import { initialState, review } from '../memorize/srs.ts';
import { HybridClock } from './clock.ts';
import { mergesByKey, planMerge, stableStringify } from './merge.ts';
import { StoreInputError, type LocalStore } from './repository.ts';
import { isValidDate, isValidItemRef, uuidv4 } from './refs.ts';
import {
  COLLECTION_NAME_MAX_LENGTH,
  GOAL_MAX_PAGES,
  ITEM_TYPES,
  NOTE_MAX_LENGTH,
  TASBIH_PHRASE_MAX_LENGTH,
  TABLE_NAMES,
  type Change,
  type CollectionRecord,
  type GoalRecord,
  type ItemType,
  type PreferencesRecord,
  type ReadingPositionRecord,
  type SyncRecord,
  type TableName,
  type TableRecords,
} from './types.ts';

export const DB_NAME = 'noor';

interface OutboxEntry {
  /** `${table}:${id}` */
  key: string;
  table: TableName;
  id: string;
  updatedAt: number;
}

interface MetaEntry {
  key: string;
  value: unknown;
}

type NoorDexie = Dexie & { [N in TableName]: Table<TableRecords[N], string> } & {
  outbox: Table<OutboxEntry, string>;
  meta: Table<MetaEntry, string>;
};

/** Version 1 of the IndexedDB schema: primary key first, then indexes. */
const SCHEMA_V1: Record<Exclude<TableName, 'adhkarDays' | 'tasbihSessions' | 'memorizationItems' | 'goals'> | 'outbox' | 'meta', string> = {
  preferences: 'id',
  readingPositions: 'id',
  readingDays: 'id, date',
  collections: 'id',
  savedItems: 'id, [type+ref], collectionId',
  notes: 'id, [targetType+targetRef]',
  outbox: 'key',
  meta: 'key',
};

/** Version 2 (Phase 7): adhkar days and tasbih sessions. */
const SCHEMA_V2 = {
  ...SCHEMA_V1,
  adhkarDays: 'id, [date+categoryId], date',
  tasbihSessions: 'id, startedAt',
};

/** Version 3 (Phase 10): memorization and reading goals. */
const SCHEMA_V3 = {
  ...SCHEMA_V2,
  memorizationItems: 'id, [surah+ayah], dueAt',
  goals: 'id, activeFrom',
};

export interface OpenOptions {
  name?: string;
  /** Injected IndexedDB (tests use fake-indexeddb). */
  indexedDB?: IDBFactory;
  IDBKeyRange?: typeof IDBKeyRange;
  wallClock?: () => number;
}

const isLive = (r: SyncRecord) => r.deletedAt === null;
const outboxKey = (table: TableName, id: string) => `${table}:${id}`;
const sameContent = (a: unknown, b: unknown) => stableStringify(a) === stableStringify(b);

function assert(condition: boolean, message: string): asserts condition {
  if (!condition) throw new StoreInputError(message);
}

export async function openLocalStore(options: OpenOptions = {}): Promise<LocalStore> {
  const name = options.name ?? DB_NAME;
  const db = new Dexie(
    name,
    options.indexedDB ? { indexedDB: options.indexedDB, IDBKeyRange: options.IDBKeyRange } : undefined
  ) as NoorDexie;
  db.version(1).stores(SCHEMA_V1);
  db.version(2).stores(SCHEMA_V2);
  db.version(3).stores(SCHEMA_V3);
  await db.open();
  const wall = options.wallClock ?? Date.now;

  const clock = new HybridClock(0, options.wallClock);
  clock.observe(Number((await db.meta.get('clock'))?.value ?? 0));

  // --- change notifications ------------------------------------------------------------------
  type Topic = TableName | 'device';
  const listeners = new Map<Topic, Set<() => void>>();
  const channel = typeof BroadcastChannel === 'function' ? new BroadcastChannel(`${name}:changes`) : null;
  const emit = (tables: Iterable<Topic>) => {
    const called = new Set<() => void>();
    for (const t of tables) {
      for (const listener of listeners.get(t) ?? []) {
        if (called.has(listener)) continue;
        called.add(listener);
        try {
          listener();
        } catch (error) {
          console.error(error);
        }
      }
    }
  };
  if (channel) {
    channel.onmessage = (e: MessageEvent<{ tables?: Topic[] }>) => emit(e.data.tables ?? []);
  }

  // --- writes --------------------------------------------------------------------------------
  const table = <N extends TableName>(n: N) => db[n] as Table<TableRecords[N], string>;
  type Put = <N extends TableName>(n: N, record: TableRecords[N]) => Promise<void>;

  async function write<R>(tables: readonly TableName[], body: (put: Put) => Promise<R>): Promise<R> {
    const changed = new Set<TableName>();
    const result = await db.transaction('rw', [...tables.map((t) => db[t]), db.outbox, db.meta], async () => {
      const put: Put = async (n, record) => {
        await table(n).put(record);
        await db.outbox.put({ key: outboxKey(n, record.id), table: n, id: record.id, updatedAt: record.updatedAt });
        changed.add(n);
      };
      const value = await body(put);
      if (changed.size) await db.meta.put({ key: 'clock', value: clock.latest });
      return value;
    });
    if (changed.size) {
      emit(changed);
      channel?.postMessage({ tables: [...changed] });
    }
    return result;
  }

  // Device values are not a synced table; their listeners use the pseudo-table "device".
  const emitDevice = () => {
    emit(['device']);
    channel?.postMessage({ tables: ['device'] });
  };

  const fresh = (): SyncRecord => {
    const t = clock.now();
    return { id: uuidv4(), createdAt: t, updatedAt: t, deletedAt: null };
  };

  async function liveSingleton<N extends 'preferences' | 'readingPositions'>(n: N): Promise<TableRecords[N] | undefined> {
    const rows = (await table(n).toArray()).filter(isLive);
    return rows.sort((a, b) => b.updatedAt - a.updatedAt)[0];
  }

  const checkType = (type: ItemType) => assert(ITEM_TYPES.includes(type), `Unknown item type ${String(type)}`);
  const checkRef = (type: ItemType, ref: string) => {
    checkType(type);
    assert(isValidItemRef(type, ref), `Invalid ${type} reference ${ref}`);
  };

  async function liveCollections(): Promise<CollectionRecord[]> {
    return (await db.collections.toArray())
      .filter(isLive)
      .sort((a, b) => a.order - b.order || a.createdAt - b.createdAt);
  }

  async function assertCollection(id: string | null | undefined): Promise<void> {
    if (!id) return;
    const c = await db.collections.get(id);
    assert(!!c && isLive(c), 'Unknown collection');
  }

  async function savedByTarget(type: ItemType, ref: string) {
    return db.savedItems.where('[type+ref]').equals([type, ref]).toArray();
  }

  async function notesByTarget(type: ItemType, ref: string) {
    return db.notes.where('[targetType+targetRef]').equals([type, ref]).toArray();
  }

  /** Local records that share the natural key of an incoming record (merge.ts). */
  async function sameKey<N extends TableName>(n: N, record: TableRecords[N]): Promise<TableRecords[N][]> {
    const r = record as TableRecords[TableName];
    switch (n) {
      case 'preferences':
      case 'readingPositions':
        return table(n).toArray();
      case 'readingDays':
        return (await db.readingDays.where('date').equals((r as TableRecords['readingDays']).date).toArray()) as TableRecords[N][];
      case 'savedItems': {
        const s = r as TableRecords['savedItems'];
        return (await savedByTarget(s.type, s.ref)) as TableRecords[N][];
      }
      case 'notes': {
        const s = r as TableRecords['notes'];
        return (await notesByTarget(s.targetType, s.targetRef)) as TableRecords[N][];
      }
      case 'adhkarDays': {
        const s = r as TableRecords['adhkarDays'];
        return (await db.adhkarDays.where('[date+categoryId]').equals([s.date, s.categoryId]).toArray()) as TableRecords[N][];
      }
      case 'memorizationItems': {
        const s = r as TableRecords['memorizationItems'];
        return (await db.memorizationItems.where('[surah+ayah]').equals([s.surah, s.ayah]).toArray()) as TableRecords[N][];
      }
      case 'goals':
        return (await db.goals.where('activeFrom').equals((r as TableRecords['goals']).activeFrom).toArray()) as TableRecords[N][];
      default:
        return [];
    }
  }

  const store: LocalStore = {
    preferences: {
      async get() {
        return (await liveSingleton('preferences'))?.data;
      },
      async update(patch) {
        return write(['preferences'], async (put) => {
          const current = await liveSingleton('preferences');
          const data = { ...current?.data, ...patch };
          if (current && sameContent(current.data, data)) return current.data;
          const record: PreferencesRecord = current
            ? { ...current, data, updatedAt: clock.now() }
            : { ...fresh(), data };
          await put('preferences', record);
          return data;
        });
      },
    },

    position: {
      get: () => liveSingleton('readingPositions'),
      async set(position) {
        assert(isValidItemRef('AYAH', `${position.surah}:${position.ayah}`), 'Invalid reading position');
        assert(isValidItemRef('PAGE', String(position.page)), 'Invalid reading position page');
        assert(position.mode === 'READING' || position.mode === 'MUSHAF', 'Invalid reading mode');
        await write(['readingPositions'], async (put) => {
          const current = await liveSingleton('readingPositions');
          const value = { surah: position.surah, ayah: position.ayah, page: position.page, mode: position.mode };
          if (current && current.surah === value.surah && current.ayah === value.ayah && current.page === value.page && current.mode === value.mode) return;
          const record: ReadingPositionRecord = current
            ? { ...current, ...value, updatedAt: clock.now() }
            : { ...fresh(), ...value };
          await put('readingPositions', record);
        });
      },
    },

    readingDays: {
      async get(date) {
        return (await db.readingDays.where('date').equals(date).toArray()).find(isLive);
      },
      async record(date, { pages = [], seconds = 0 }) {
        assert(isValidDate(date), `Invalid date ${date}`);
        assert(pages.every((p) => isValidItemRef('PAGE', String(p))), 'Invalid page number');
        assert(Number.isFinite(seconds) && seconds >= 0, 'Invalid seconds');
        const addSeconds = Math.round(seconds);
        await write(['readingDays'], async (put) => {
          const current = (await db.readingDays.where('date').equals(date).toArray()).find(isLive);
          const pagesRead = [...new Set([...(current?.pagesRead ?? []), ...pages])].sort((a, b) => a - b);
          if (current && addSeconds === 0 && pagesRead.length === current.pagesRead.length) return;
          if (!current && addSeconds === 0 && pagesRead.length === 0) return;
          await put(
            'readingDays',
            current
              ? { ...current, pagesRead, secondsRead: current.secondsRead + addSeconds, updatedAt: clock.now() }
              : { ...fresh(), date, pagesRead, secondsRead: addSeconds }
          );
        });
      },
      async list(from = '0000-00-00', to = '9999-99-99') {
        return (await db.readingDays.where('date').between(from, to, true, true).toArray()).filter(isLive);
      },
    },

    saved: {
      async list() {
        return (await db.savedItems.toArray()).filter(isLive).sort((a, b) => b.createdAt - a.createdAt);
      },
      async find(type, ref) {
        return (await savedByTarget(type, ref)).find(isLive);
      },
      async save(type, ref, collectionId) {
        checkRef(type, ref);
        return write(['savedItems', 'collections'], async (put) => {
          await assertCollection(collectionId);
          const all = await savedByTarget(type, ref);
          const live = all.find(isLive);
          if (live) {
            if (collectionId === undefined || live.collectionId === collectionId) return live;
            const updated = { ...live, collectionId, updatedAt: clock.now() };
            await put('savedItems', updated);
            return updated;
          }
          // Revive the most recent tombstone of this target instead of creating a duplicate.
          const dead = all.sort((a, b) => b.updatedAt - a.updatedAt)[0];
          const t = clock.now();
          const record = dead
            ? { ...dead, collectionId: collectionId ?? null, createdAt: t, updatedAt: t, deletedAt: null }
            : { ...fresh(), type, ref, collectionId: collectionId ?? null };
          await put('savedItems', record);
          return record;
        });
      },
      async setCollection(id, collectionId) {
        await write(['savedItems', 'collections'], async (put) => {
          const item = await db.savedItems.get(id);
          assert(!!item && isLive(item), 'Unknown saved item');
          await assertCollection(collectionId);
          if (item.collectionId === collectionId) return;
          await put('savedItems', { ...item, collectionId, updatedAt: clock.now() });
        });
      },
      async remove(id) {
        await write(['savedItems'], async (put) => {
          const item = await db.savedItems.get(id);
          if (!item || !isLive(item)) return;
          const t = clock.now();
          await put('savedItems', { ...item, deletedAt: t, updatedAt: t });
        });
      },
    },

    collections: {
      list: liveCollections,
      async create(rawName) {
        const name = rawName.trim();
        assert(name.length > 0 && name.length <= COLLECTION_NAME_MAX_LENGTH, 'Invalid collection name');
        return write(['collections'], async (put) => {
          const list = await liveCollections();
          const record: CollectionRecord = { ...fresh(), name, order: (list.at(-1)?.order ?? -1) + 1 };
          await put('collections', record);
          return record;
        });
      },
      async rename(id, rawName) {
        const name = rawName.trim();
        assert(name.length > 0 && name.length <= COLLECTION_NAME_MAX_LENGTH, 'Invalid collection name');
        await write(['collections'], async (put) => {
          const c = await db.collections.get(id);
          assert(!!c && isLive(c), 'Unknown collection');
          if (c.name !== name) await put('collections', { ...c, name, updatedAt: clock.now() });
        });
      },
      async move(id, step) {
        await write(['collections'], async (put) => {
          const list = await liveCollections();
          const from = list.findIndex((c) => c.id === id);
          const to = from + step;
          if (from < 0 || to < 0 || to >= list.length) return;
          [list[from], list[to]] = [list[to]!, list[from]!];
          // Renumber so orders stay 0…n-1 even after merges from other devices.
          for (const [order, c] of list.entries()) {
            if (c.order !== order) await put('collections', { ...c, order, updatedAt: clock.now() });
          }
        });
      },
      async remove(id) {
        await write(['collections', 'savedItems'], async (put) => {
          const c = await db.collections.get(id);
          if (!c || !isLive(c)) return;
          const t = clock.now();
          await put('collections', { ...c, deletedAt: t, updatedAt: t });
          for (const item of await db.savedItems.where('collectionId').equals(id).toArray()) {
            if (isLive(item)) await put('savedItems', { ...item, collectionId: null, updatedAt: clock.now() });
          }
        });
      },
    },

    notes: {
      async list() {
        return (await db.notes.toArray()).filter(isLive).sort((a, b) => b.updatedAt - a.updatedAt);
      },
      async get(type, ref) {
        return (await notesByTarget(type, ref)).find(isLive);
      },
      async set(type, ref, rawBody) {
        checkRef(type, ref);
        const body = rawBody.trim();
        assert(body.length <= NOTE_MAX_LENGTH, 'Note is too long');
        return write(['notes'], async (put) => {
          const all = await notesByTarget(type, ref);
          const live = all.find(isLive);
          const t = clock.now();
          if (!body) {
            if (live) await put('notes', { ...live, deletedAt: t, updatedAt: t });
            return undefined;
          }
          if (live) {
            if (live.body === body) return live;
            const updated = { ...live, body, updatedAt: t };
            await put('notes', updated);
            return updated;
          }
          const dead = all.sort((a, b) => b.updatedAt - a.updatedAt)[0];
          const record = dead
            ? { ...dead, body, createdAt: t, updatedAt: t, deletedAt: null }
            : { id: uuidv4(), createdAt: t, updatedAt: t, deletedAt: null, targetType: type, targetRef: ref, body };
          await put('notes', record);
          return record;
        });
      },
      async remove(id) {
        await write(['notes'], async (put) => {
          const note = await db.notes.get(id);
          if (!note || !isLive(note)) return;
          const t = clock.now();
          await put('notes', { ...note, deletedAt: t, updatedAt: t });
        });
      },
    },

    adhkar: {
      async get(date, categoryId) {
        return (await db.adhkarDays.where('[date+categoryId]').equals([date, categoryId]).toArray()).find(isLive);
      },
      async setCount(date, categoryId, dhikrId, count, completed) {
        assert(isValidDate(date), `Invalid date ${date}`);
        assert(/^[a-z0-9-]{1,40}$/.test(categoryId), 'Invalid category');
        assert(isValidItemRef('DHIKR', dhikrId), 'Invalid dhikr id');
        assert(Number.isInteger(count) && count >= 0 && count <= 100_000, 'Invalid count');
        await write(['adhkarDays'], async (put) => {
          const current = (await db.adhkarDays.where('[date+categoryId]').equals([date, categoryId]).toArray()).find(isLive);
          const counts = { ...current?.counts, [dhikrId]: count };
          if (current && current.counts[dhikrId] === count && current.completed === completed) return;
          await put(
            'adhkarDays',
            current ? { ...current, counts, completed, updatedAt: clock.now() } : { ...fresh(), date, categoryId, counts, completed }
          );
        });
      },
      async list(from = '0000-00-00', to = '9999-99-99') {
        return (await db.adhkarDays.where('date').between(from, to, true, true).toArray()).filter(isLive);
      },
    },

    memorization: {
      async list() {
        return (await db.memorizationItems.toArray()).filter(isLive).sort((a, b) => a.surah - b.surah || a.ayah - b.ayah);
      },
      async add(surah, ayahs) {
        assert(Number.isInteger(surah) && surah >= 1 && surah <= 114, `Invalid surah ${surah}`);
        assert(ayahs.length <= 286 && ayahs.every((a) => Number.isInteger(a) && a >= 1 && a <= 286), 'Invalid ayahs');
        return write(['memorizationItems'], async (put) => {
          let added = 0;
          for (const ayah of new Set(ayahs)) {
            const rows = await db.memorizationItems.where('[surah+ayah]').equals([surah, ayah]).toArray();
            if (rows.some(isLive)) continue;
            const state = initialState(wall());
            // A removed ayah comes back with a fresh schedule under its old id.
            await put('memorizationItems', rows[0] ? { ...rows[0], ...state, deletedAt: null, updatedAt: clock.now() } : { ...fresh(), surah, ayah, ...state });
            added++;
          }
          return added;
        });
      },
      async review(surah, ayah, grade) {
        return write(['memorizationItems'], async (put) => {
          const current = (await db.memorizationItems.where('[surah+ayah]').equals([surah, ayah]).toArray()).find(isLive);
          assert(current !== undefined, `${surah}:${ayah} is not in memorization`);
          const next = { ...current, ...review(current, grade, wall()), updatedAt: clock.now() };
          await put('memorizationItems', next);
          return next;
        });
      },
      async remove(surah, from = 1, to = 286) {
        await write(['memorizationItems'], async (put) => {
          const rows = await db.memorizationItems.where('[surah+ayah]').between([surah, from], [surah, to], true, true).toArray();
          for (const r of rows.filter(isLive)) {
            const t = clock.now();
            await put('memorizationItems', { ...r, deletedAt: t, updatedAt: t });
          }
        });
      },
    },

    goals: {
      async list() {
        return (await db.goals.orderBy('activeFrom').toArray()).filter(isLive);
      },
      async set(amount, date) {
        assert(isValidDate(date), `Invalid date ${date}`);
        assert(Number.isInteger(amount) && amount >= 0 && amount <= GOAL_MAX_PAGES, 'Invalid goal');
        return write(['goals'], async (put) => {
          const current = (await db.goals.where('activeFrom').equals(date).toArray()).find(isLive);
          if (current?.amount === amount) return current;
          const record: GoalRecord = current ? { ...current, amount, updatedAt: clock.now() } : { ...fresh(), unit: 'PAGES', amount, activeFrom: date };
          await put('goals', record);
          return record;
        });
      },
    },

    tasbih: {
      async current() {
        const all = await db.tasbihSessions.orderBy('startedAt').reverse().toArray();
        return all.find((t) => isLive(t) && t.endedAt === null);
      },
      async start(rawPhrase, target) {
        const phrase = rawPhrase.trim();
        assert(phrase.length > 0 && phrase.length <= TASBIH_PHRASE_MAX_LENGTH, 'Invalid phrase');
        assert(target === null || (Number.isInteger(target) && target > 0 && target <= 100_000), 'Invalid target');
        return write(['tasbihSessions'], async (put) => {
          for (const t of await db.tasbihSessions.toArray()) {
            if (isLive(t) && t.endedAt === null) await put('tasbihSessions', { ...t, endedAt: clock.now(), updatedAt: clock.now() });
          }
          const base = fresh();
          const record = { ...base, phrase, count: 0, target, startedAt: base.createdAt, endedAt: null };
          await put('tasbihSessions', record);
          return record;
        });
      },
      async update(id, patch) {
        assert(patch.count === undefined || (Number.isInteger(patch.count) && patch.count >= 0 && patch.count <= 1_000_000), 'Invalid count');
        assert(patch.target === undefined || patch.target === null || (Number.isInteger(patch.target) && patch.target > 0), 'Invalid target');
        await write(['tasbihSessions'], async (put) => {
          const t = await db.tasbihSessions.get(id);
          assert(!!t && isLive(t), 'Unknown tasbih session');
          const next = { ...t, ...patch };
          if (next.count === t.count && next.target === t.target) return;
          await put('tasbihSessions', { ...next, updatedAt: clock.now() });
        });
      },
      async end(id) {
        await write(['tasbihSessions'], async (put) => {
          const t = await db.tasbihSessions.get(id);
          if (!t || !isLive(t) || t.endedAt !== null) return;
          await put('tasbihSessions', { ...t, endedAt: clock.now(), updatedAt: clock.now() });
        });
      },
      async history(limit = 30) {
        return (await db.tasbihSessions.orderBy('startedAt').reverse().toArray()).filter(isLive).slice(0, limit);
      },
    },

    device: {
      async get<T>(key: string) {
        assert(/^[a-z0-9:._-]{1,60}$/.test(key), 'Invalid device key');
        return (await db.meta.get(`device:${key}`))?.value as T | undefined;
      },
      async set(key, value) {
        assert(/^[a-z0-9:._-]{1,60}$/.test(key), 'Invalid device key');
        await db.meta.put({ key: `device:${key}`, value });
        emitDevice();
      },
      async remove(key) {
        await db.meta.delete(`device:${key}`);
        emitDevice();
      },
    },

    sync: {
      async pending() {
        const changes: Change[] = [];
        for (const entry of await db.outbox.toArray()) {
          const record = await table(entry.table).get(entry.id);
          if (record) changes.push({ table: entry.table, record } as Change);
        }
        return changes;
      },
      async acknowledge(changes) {
        await db.transaction('rw', db.outbox, async () => {
          for (const { table: n, record } of changes) {
            const key = outboxKey(n, record.id);
            const entry = await db.outbox.get(key);
            if (entry && entry.updatedAt === record.updatedAt) await db.outbox.delete(key);
          }
        });
      },
      async applyRemote(changes) {
        const changed = new Set<TableName>();
        await db.transaction('rw', [...TABLE_NAMES.map((t) => db[t]), db.outbox, db.meta], async () => {
          for (const change of changes) {
            const n = change.table;
            const record = change.record as TableRecords[TableName];
            assert(TABLE_NAMES.includes(n), `Unknown table ${String(n)}`);
            clock.observe(record.updatedAt);
            const t = table(n);
            const local: TableRecords[TableName][] = [];
            const same = await t.get(record.id);
            if (same) local.push(same);
            if (mergesByKey(n) !== 'none') local.push(...(await sameKey(n, record)).filter((r) => r.id !== record.id));
            const plan = planMerge(n, record, local, () => clock.now());
            for (const r of plan.accept) {
              await t.put(r);
              await db.outbox.delete(outboxKey(n, r.id));
            }
            for (const r of plan.push) {
              await t.put(r);
              await db.outbox.put({ key: outboxKey(n, r.id), table: n, id: r.id, updatedAt: r.updatedAt });
            }
            for (const id of plan.drop) {
              await t.delete(id);
              await db.outbox.delete(outboxKey(n, id));
            }
            if (plan.accept.length || plan.push.length || plan.drop.length) changed.add(n);
          }
          await db.meta.put({ key: 'clock', value: clock.latest });
        });
        if (changed.size) {
          emit(changed);
          channel?.postMessage({ tables: [...changed] });
        }
      },
      async getCursor() {
        const value = (await db.meta.get('cursor'))?.value;
        return typeof value === 'string' ? value : null;
      },
      async setCursor(cursor) {
        await db.meta.put({ key: 'cursor', value: cursor });
      },
      async reset() {
        await db.transaction('rw', [...TABLE_NAMES.map((t) => db[t]), db.outbox, db.meta], async () => {
          for (const t of TABLE_NAMES) await table(t).clear();
          await db.outbox.clear();
          await db.meta.delete('cursor');
        });
        emit(TABLE_NAMES);
        channel?.postMessage({ tables: [...TABLE_NAMES] });
      },
      async detach() {
        await db.transaction('rw', [...TABLE_NAMES.map((t) => db[t]), db.outbox, db.meta], async () => {
          await db.outbox.clear();
          await db.meta.delete('cursor');
          for (const n of TABLE_NAMES) {
            for (const r of (await table(n).toArray()) as TableRecords[TableName][]) {
              if (r.deletedAt !== null) await table(n).delete(r.id);
              else await db.outbox.put({ key: outboxKey(n, r.id), table: n, id: r.id, updatedAt: r.updatedAt });
            }
          }
        });
        emit(TABLE_NAMES);
        channel?.postMessage({ tables: [...TABLE_NAMES] });
      },
    },

    async dump() {
      const out = {} as Record<TableName, TableRecords[TableName][]>;
      for (const t of TABLE_NAMES) out[t] = await table(t).toArray();
      return out;
    },

    subscribe(tables, listener) {
      for (const t of tables) {
        let set = listeners.get(t);
        if (!set) listeners.set(t, (set = new Set()));
        set.add(listener);
      }
      return () => tables.forEach((t) => listeners.get(t)?.delete(listener));
    },

    close() {
      channel?.close();
      db.close();
    },
  };

  return store;
}
