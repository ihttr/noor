// The sync wire format (SPEC §5): POST /api/sync with { cursor, changes } returns
// { changes, cursor, more }. Records travel in the local store's shape (epoch milliseconds,
// `YYYY-MM-DD` dates); every field is validated (SPEC §12).

import { z } from 'zod';
import { isValidItemRef } from '../store/refs.ts';
import {
  COLLECTION_NAME_MAX_LENGTH,
  GOAL_MAX_PAGES,
  ITEM_TYPES,
  NOTE_MAX_LENGTH,
  TABLE_NAMES,
  TASBIH_PHRASE_MAX_LENGTH,
  type Change,
  type TableName,
} from '../store/types.ts';

export const SYNC_BATCH = 500;

const ms = z.number().int().min(0).max(8_640_000_000_000_000);
const base = { id: z.uuid(), createdAt: ms, updatedAt: ms, deletedAt: ms.nullable() };
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const itemType = z.enum(ITEM_TYPES);
const int = (min: number, max: number) => z.number().int().min(min).max(max);

const RECORDS = {
  preferences: z
    .object({ ...base, data: z.record(z.string(), z.unknown()) })
    .refine((r) => JSON.stringify(r.data).length <= 16_384, 'preferences too large'),
  readingPositions: z.object({ ...base, surah: int(1, 114), ayah: int(1, 286), page: int(1, 604), mode: z.enum(['READING', 'MUSHAF']) }),
  readingDays: z.object({ ...base, date, pagesRead: z.array(int(1, 604)).max(604), secondsRead: int(0, 86_400) }),
  collections: z.object({ ...base, name: z.string().min(1).max(COLLECTION_NAME_MAX_LENGTH), order: int(0, 100_000) }),
  savedItems: z
    .object({ ...base, type: itemType, ref: z.string().max(80), collectionId: z.uuid().nullable() })
    .refine((r) => isValidItemRef(r.type, r.ref), 'invalid ref'),
  notes: z
    .object({ ...base, targetType: itemType, targetRef: z.string().max(80), body: z.string().max(NOTE_MAX_LENGTH * 2) })
    .refine((r) => isValidItemRef(r.targetType, r.targetRef), 'invalid ref'),
  adhkarDays: z.object({
    ...base,
    date,
    categoryId: z.string().regex(/^[a-z0-9-]{1,40}$/),
    counts: z.record(z.string().max(50), int(0, 100_000)).refine((c) => Object.keys(c).length <= 500, 'too many counts'),
    completed: z.boolean(),
  }),
  tasbihSessions: z.object({
    ...base,
    phrase: z.string().min(1).max(TASBIH_PHRASE_MAX_LENGTH),
    count: int(0, 1_000_000),
    target: int(1, 100_000).nullable(),
    startedAt: ms,
    endedAt: ms.nullable(),
  }),
  memorizationItems: z.object({
    ...base,
    surah: int(1, 114),
    ayah: int(1, 286),
    status: z.enum(['NEW', 'LEARNING', 'REVIEWING', 'MEMORIZED']),
    ease: z.number().min(1.3).max(5),
    intervalDays: int(0, 36_500),
    repetitions: int(0, 10_000),
    dueAt: ms,
    lastReviewedAt: ms.nullable(),
  }),
  goals: z.object({ ...base, unit: z.literal('PAGES'), amount: int(0, GOAL_MAX_PAGES), activeFrom: date }),
} satisfies Record<TableName, z.ZodType>;

const change = z.discriminatedUnion(
  'table',
  TABLE_NAMES.map((table) => z.object({ table: z.literal(table), record: RECORDS[table] })) as unknown as [
    z.ZodObject<{ table: z.ZodLiteral<TableName>; record: z.ZodType }>,
    ...z.ZodObject<{ table: z.ZodLiteral<TableName>; record: z.ZodType }>[],
  ]
);

export const SyncRequestSchema = z.object({
  cursor: z.string().regex(/^\d{1,19}$/).nullable(),
  changes: z.array(change).max(SYNC_BATCH),
});

export interface SyncRequest {
  cursor: string | null;
  changes: Change[];
}

export interface SyncResponse {
  /** Server versions of the pushed records and everything changed after the cursor. */
  changes: Change[];
  cursor: string;
  /** More changes are waiting: call again with the new cursor. */
  more: boolean;
}

export function parseSyncRequest(body: unknown): SyncRequest | null {
  const r = SyncRequestSchema.safeParse(body);
  return r.success ? (r.data as SyncRequest) : null;
}
