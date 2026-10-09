// Server side of sync (SPEC §5, D-061). Applies a user's pushed records with the same rules as
// the client (merge.ts): last write wins by `updatedAt`; one row per user for preferences and
// reading position, per date for reading days, per date + category for adhkar days (merged by
// union / max), per ayah for memorization and per start date for goals. Then returns everything changed after the cursor, ordered by `serverSeq`.
// Every query is scoped to the session's user (SPEC §12).

import type { PrismaClient } from '../../generated/prisma/client.ts';
import { mergeAdhkarDays, mergeReadingDays, newer } from '../store/merge.ts';
import type { Change, TableName, TableRecords } from '../store/types.ts';
import type { SyncRequest, SyncResponse } from './protocol.ts';

type Tx = Parameters<Parameters<PrismaClient['$transaction']>[0]>[0];
type Row = Record<string, unknown> & { id: string; userId: string; serverSeq: bigint; updatedAt: Date; createdAt: Date; deletedAt: Date | null };

const PULL_LIMIT = 500;
const toDate = (ms: number) => new Date(ms);
const toMs = (d: Date) => d.getTime();
const dayToDate = (day: string) => new Date(`${day}T00:00:00Z`);
const dateToDay = (d: Date) => d.toISOString().slice(0, 10);

const MODEL: Record<TableName, string> = {
  preferences: 'userPreferences',
  readingPositions: 'readingPosition',
  readingDays: 'readingDay',
  collections: 'collection',
  savedItems: 'savedItem',
  notes: 'note',
  adhkarDays: 'adhkarDay',
  tasbihSessions: 'tasbihSession',
  memorizationItems: 'memorizationItem',
  goals: 'goal',
};

/** Pushes are applied in this order so that references exist (collections before saved items). */
const ORDER: TableName[] = [
  'preferences',
  'readingPositions',
  'readingDays',
  'collections',
  'savedItems',
  'notes',
  'adhkarDays',
  'tasbihSessions',
  'memorizationItems',
  'goals',
];

interface ModelApi {
  findUnique(args: { where: { id: string } }): Promise<Row | null>;
  findFirst(args: { where: Record<string, unknown> }): Promise<Row | null>;
  findMany(args: { where: Record<string, unknown>; orderBy: { serverSeq: 'asc' }; take: number }): Promise<Row[]>;
  create(args: { data: Record<string, unknown> }): Promise<Row>;
  update(args: { where: { id: string }; data: Record<string, unknown> }): Promise<Row>;
}
const model = (tx: Tx, table: TableName) => (tx as unknown as Record<string, ModelApi>)[MODEL[table]]!;

/** Client record → database columns (without id and userId). */
function toColumns<N extends TableName>(table: N, r: TableRecords[N]): Record<string, unknown> {
  const common = { createdAt: toDate(r.createdAt), updatedAt: toDate(r.updatedAt), deletedAt: r.deletedAt === null ? null : toDate(r.deletedAt) };
  const x = r as unknown as Record<string, unknown>;
  switch (table) {
    case 'preferences':
      return { ...common, data: x.data };
    case 'readingPositions':
      return { ...common, surah: x.surah, ayah: x.ayah, page: x.page, mode: x.mode };
    case 'readingDays':
      return { ...common, date: dayToDate(x.date as string), pagesRead: x.pagesRead, secondsRead: x.secondsRead };
    case 'collections':
      return { ...common, name: x.name, order: x.order };
    case 'savedItems':
      return { ...common, type: x.type, ref: x.ref, collectionId: x.collectionId };
    case 'notes':
      return { ...common, targetType: x.targetType, targetRef: x.targetRef, body: x.body };
    case 'adhkarDays':
      return { ...common, date: dayToDate(x.date as string), categoryId: x.categoryId, counts: x.counts, completed: x.completed };
    case 'tasbihSessions':
      return { ...common, phrase: x.phrase, count: x.count, target: x.target, startedAt: toDate(x.startedAt as number), endedAt: x.endedAt === null ? null : toDate(x.endedAt as number) };
    case 'memorizationItems':
      return {
        ...common,
        surah: x.surah,
        ayah: x.ayah,
        status: x.status,
        ease: x.ease,
        intervalDays: x.intervalDays,
        repetitions: x.repetitions,
        dueAt: toDate(x.dueAt as number),
        lastReviewedAt: x.lastReviewedAt === null ? null : toDate(x.lastReviewedAt as number),
      };
    case 'goals':
      return { ...common, unit: x.unit, amount: x.amount, activeFrom: dayToDate(x.activeFrom as string) };
  }
  return common;
}

/** Database row → client record. */
export function toRecord(table: TableName, row: Row): TableRecords[TableName] {
  const common = { id: row.id, createdAt: toMs(row.createdAt), updatedAt: toMs(row.updatedAt), deletedAt: row.deletedAt ? toMs(row.deletedAt) : null };
  const x = row as Record<string, unknown>;
  const n = (k: string) => x[k] as number;
  const str = (k: string) => x[k] as string;
  const day = (k: string) => dateToDay(x[k] as Date);
  let record: unknown;
  switch (table) {
    case 'preferences':
      record = { ...common, data: x.data };
      break;
    case 'readingPositions':
      record = { ...common, surah: n('surah'), ayah: n('ayah'), page: n('page'), mode: str('mode') };
      break;
    case 'readingDays':
      record = { ...common, date: day('date'), pagesRead: x.pagesRead, secondsRead: n('secondsRead') };
      break;
    case 'collections':
      record = { ...common, name: str('name'), order: n('order') };
      break;
    case 'savedItems':
      record = { ...common, type: str('type'), ref: str('ref'), collectionId: x.collectionId ?? null };
      break;
    case 'notes':
      record = { ...common, targetType: str('targetType'), targetRef: str('targetRef'), body: str('body') };
      break;
    case 'adhkarDays':
      record = { ...common, date: day('date'), categoryId: str('categoryId'), counts: x.counts, completed: Boolean(x.completed) };
      break;
    case 'tasbihSessions':
      record = {
        ...common,
        phrase: str('phrase'),
        count: n('count'),
        target: (x.target as number | null) ?? null,
        startedAt: toMs(x.startedAt as Date),
        endedAt: x.endedAt ? toMs(x.endedAt as Date) : null,
      };
      break;
    case 'memorizationItems':
      record = {
        ...common,
        surah: n('surah'),
        ayah: n('ayah'),
        status: str('status'),
        ease: n('ease'),
        intervalDays: n('intervalDays'),
        repetitions: n('repetitions'),
        dueAt: toMs(x.dueAt as Date),
        lastReviewedAt: x.lastReviewedAt ? toMs(x.lastReviewedAt as Date) : null,
      };
      break;
    case 'goals':
      record = { ...common, unit: str('unit'), amount: n('amount'), activeFrom: day('activeFrom') };
      break;
  }
  return record as TableRecords[TableName];
}

/** The natural key the database keeps unique for a table (null: rows are matched by id only). */
function naturalWhere(table: TableName, userId: string, r: TableRecords[TableName]): Record<string, unknown> | null {
  const x = r as unknown as Record<string, unknown>;
  if (table === 'preferences' || table === 'readingPositions') return { userId };
  if (table === 'readingDays') return { userId, date: dayToDate(x.date as string) };
  if (table === 'adhkarDays') return { userId, date: dayToDate(x.date as string), categoryId: x.categoryId };
  if (table === 'memorizationItems') return { userId, surah: x.surah, ayah: x.ayah };
  if (table === 'goals') return { userId, activeFrom: dayToDate(x.activeFrom as string) };
  return null;
}

async function applyOne(tx: Tx, userId: string, change: Change): Promise<Row | null> {
  const { table } = change;
  const incoming = change.record;
  const m = model(tx, table);
  const byId = await m.findUnique({ where: { id: incoming.id } });
  if (byId && byId.userId !== userId) return null; // Never touch another user's row.
  const natural = naturalWhere(table, userId, incoming);
  const row = byId ?? (natural ? await m.findFirst({ where: natural }) : null);
  const columns = toColumns(table, incoming);

  if (table === 'savedItems' && columns.collectionId) {
    const c = await model(tx, 'collections').findUnique({ where: { id: columns.collectionId as string } });
    if (!c || c.userId !== userId) columns.collectionId = null;
  }
  if (!row) return m.create({ data: { ...columns, id: incoming.id, userId } });

  const current = toRecord(table, row);
  if (table === 'readingDays' || table === 'adhkarDays') {
    const merged =
      table === 'readingDays'
        ? mergeReadingDays(current as TableRecords['readingDays'], incoming as TableRecords['readingDays'])
        : mergeAdhkarDays(current as TableRecords['adhkarDays'], incoming as TableRecords['adhkarDays']);
    const next = { ...current, ...merged, updatedAt: Math.max(current.updatedAt, incoming.updatedAt) } as TableRecords[TableName];
    if (JSON.stringify(next) === JSON.stringify(current)) return row;
    const data = toColumns<TableName>(table, next);
    return m.update({ where: { id: row.id }, data: { ...data, createdAt: row.createdAt } });
  }
  // Last write wins (same tie-break as the clients); the row keeps the server's id.
  if (newer({ ...incoming, id: row.id }, current) === current) return row;
  return m.update({ where: { id: row.id }, data: columns });
}

// A batch of 500 changes is a few hundred statements; waiting for this user's lock (or a busy
// pool) can take longer than Prisma's defaults (2 s / 5 s).
const TX_OPTIONS = { maxWait: 10_000, timeout: 30_000 };

export async function handleSync(db: PrismaClient, userId: string, request: SyncRequest): Promise<SyncResponse> {
  return db.$transaction(async (tx) => {
    // One sync at a time per user: rows are numbered in commit order for this user (D-061).
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${userId}))`;

    const echoed: Change[] = [];
    const pushed = [...request.changes].sort((a, b) => ORDER.indexOf(a.table) - ORDER.indexOf(b.table));
    for (const change of pushed) {
      const row = await applyOne(tx, userId, change);
      if (row) echoed.push({ table: change.table, record: toRecord(change.table, row) } as Change);
    }

    const after = BigInt(request.cursor ?? '0');
    const rows: { table: TableName; row: Row }[] = [];
    let full = false;
    for (const table of ORDER) {
      const found = await model(tx, table).findMany({ where: { userId, serverSeq: { gt: after } }, orderBy: { serverSeq: 'asc' }, take: PULL_LIMIT });
      if (found.length === PULL_LIMIT) full = true;
      rows.push(...found.map((row) => ({ table, row })));
    }
    rows.sort((a, b) => (a.row.serverSeq < b.row.serverSeq ? -1 : a.row.serverSeq > b.row.serverSeq ? 1 : 0));
    const page = rows.slice(0, PULL_LIMIT);
    const cursor = page.length ? page.at(-1)!.row.serverSeq : after;
    const pulled = page.map(({ table, row }) => ({ table, record: toRecord(table, row) }) as Change);
    return { changes: [...echoed, ...pulled], cursor: cursor.toString(), more: full || rows.length > page.length };
  }, TX_OPTIONS);
}

/** Everything stored for a user, for "Export my data" (SPEC §7.19). */
export async function exportUserData(db: PrismaClient, userId: string): Promise<Record<TableName, TableRecords[TableName][]>> {
  const out = {} as Record<TableName, TableRecords[TableName][]>;
  for (const table of ORDER) {
    const rows = await (db as unknown as Record<string, ModelApi>)[MODEL[table]]!.findMany({ where: { userId }, orderBy: { serverSeq: 'asc' }, take: 100_000 });
    out[table] = rows.map((row) => toRecord(table, row));
  }
  return out;
}
