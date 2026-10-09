// Merge rules for records that arrive from another device through the server (SPEC §5, D-043).
// Pure functions: the Phase 9 transport only feeds incoming changes to `LocalStore.sync`, which
// applies the plan computed here.
//
// - Last write wins per record by `updatedAt`; equal timestamps are broken by content, so every
//   device keeps the same version.
// - Tables the server keeps unique per user (preferences and reading position: one row; reading
//   days: one row per date; memorization: one row per ayah; goals: one row per start date) adopt
//   the server's record id. Reading days merge by union of pages
//   and max of seconds.
// - Saved items (type + ref) and notes (target) that were created on two devices are folded into
//   the record with the smallest id; the other one becomes a tombstone. Two different note texts
//   are kept both, oldest first, so no private writing is lost.

import type { AdhkarDayRecord, NoteRecord, ReadingDayRecord, SavedItemRecord, SyncRecord, TableName, TableRecords } from './types.ts';

type Rule<T> = { kind: 'id' } | { kind: 'unique'; key: (r: T) => string } | { kind: 'dedupe'; key: (r: T) => string };

const RULES: { [N in TableName]: Rule<TableRecords[N]> } = {
  preferences: { kind: 'unique', key: () => '' },
  readingPositions: { kind: 'unique', key: () => '' },
  readingDays: { kind: 'unique', key: (r) => r.date },
  collections: { kind: 'id' },
  savedItems: { kind: 'dedupe', key: (r) => `${r.type}|${r.ref}` },
  notes: { kind: 'dedupe', key: (r) => `${r.targetType}|${r.targetRef}` },
  adhkarDays: { kind: 'unique', key: (r) => `${r.date}|${r.categoryId}` },
  tasbihSessions: { kind: 'id' },
  memorizationItems: { kind: 'unique', key: (r) => `${r.surah}:${r.ayah}` },
  goals: { kind: 'unique', key: (r) => r.activeFrom },
};

/** The natural key the server keeps unique (or deduplicates), or null for plain records. */
export function naturalKey<N extends TableName>(table: N, record: TableRecords[N]): string | null {
  const rule = RULES[table] as Rule<TableRecords[N]>;
  return rule.kind === 'id' ? null : rule.key(record);
}

/** Whether local records with the same natural key but another id take part in the merge. */
export function mergesByKey(table: TableName): 'all' | 'live' | 'none' {
  const kind = RULES[table].kind;
  return kind === 'unique' ? 'all' : kind === 'dedupe' ? 'live' : 'none';
}

/** JSON with sorted keys: identical on every device for identical content. */
export function stableStringify(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  if (value !== null && typeof value === 'object') {
    const o = value as Record<string, unknown>;
    return `{${Object.keys(o)
      .filter((k) => o[k] !== undefined)
      .sort()
      .map((k) => `${JSON.stringify(k)}:${stableStringify(o[k])}`)
      .join(',')}}`;
  }
  return JSON.stringify(value) ?? 'null';
}

/** Last write wins; ties go to the larger serialization (deterministic on every device). */
export function newer<T extends SyncRecord>(a: T, b: T): T {
  if (a.updatedAt !== b.updatedAt) return a.updatedAt > b.updatedAt ? a : b;
  return stableStringify(a) >= stableStringify(b) ? a : b;
}

/** Reading days merge by union (pages read) and max (seconds) — SPEC §5. */
export function mergeReadingDays(a: ReadingDayRecord, b: ReadingDayRecord): Pick<ReadingDayRecord, 'pagesRead' | 'secondsRead' | 'createdAt'> {
  return {
    pagesRead: [...new Set([...a.pagesRead, ...b.pagesRead])].sort((x, y) => x - y),
    secondsRead: Math.max(a.secondsRead, b.secondsRead),
    createdAt: Math.min(a.createdAt, b.createdAt),
  };
}

/** Adhkar days merge by max count per dhikr; a category completed on any device stays completed. */
export function mergeAdhkarDays(a: AdhkarDayRecord, b: AdhkarDayRecord): Pick<AdhkarDayRecord, 'counts' | 'completed' | 'createdAt'> {
  const counts: Record<string, number> = { ...a.counts };
  for (const [k, v] of Object.entries(b.counts)) counts[k] = Math.max(counts[k] ?? 0, v);
  return { counts, completed: a.completed || b.completed, createdAt: Math.min(a.createdAt, b.createdAt) };
}

const byAge = (a: SyncRecord, b: SyncRecord) => a.createdAt - b.createdAt || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);

/** Both texts survive when the same target got two different notes (oldest first). */
export function combineNoteBodies(notes: readonly NoteRecord[]): string {
  const bodies: string[] = [];
  for (const note of [...notes].sort(byAge)) {
    if (bodies.some((b) => b.includes(note.body))) continue;
    for (let i = bodies.length - 1; i >= 0; i--) if (note.body.includes(bodies[i]!)) bodies.splice(i, 1);
    bodies.push(note.body);
  }
  return bodies.join('\n\n');
}

export interface MergePlan<T> {
  /** Store locally as received (not queued for upload). */
  accept: T[];
  /** Store locally and queue for upload: the merge produced a version the server lacks. */
  push: T[];
  /** Local record ids to delete outright (folded into the server's record of a unique key). */
  drop: string[];
}

/**
 * Plans how to apply one incoming record. `local` holds the local record with the same id (if
 * any) and the local records sharing its natural key (see `mergesByKey`). `stamp` returns a fresh
 * hybrid-clock time, later than `incoming.updatedAt`.
 */
export function planMerge<N extends TableName>(
  table: N,
  incoming: TableRecords[N],
  local: readonly TableRecords[N][],
  stamp: () => number
): MergePlan<TableRecords[N]> {
  type T = TableRecords[N];
  const rule = RULES[table] as Rule<T>;
  const same = local.find((r) => r.id === incoming.id);
  const plan: MergePlan<T> = { accept: [], push: [], drop: [] };

  if (rule.kind === 'id' || (rule.kind === 'dedupe' && incoming.deletedAt !== null)) {
    if (!same || newer(incoming, same) === incoming) plan.accept.push(incoming);
    return plan;
  }

  const key = rule.key(incoming);
  const others = local.filter((r) => r.id !== incoming.id && rule.key(r) === key && (rule.kind === 'unique' || r.deletedAt === null));

  if (rule.kind === 'unique') {
    plan.drop.push(...others.map((r) => r.id));
    if (table === 'readingDays') {
      const days = [same, ...others].filter((r): r is T => r !== undefined) as unknown as ReadingDayRecord[];
      const inc = incoming as ReadingDayRecord;
      const merged = days.reduce((acc, d) => ({ ...acc, ...mergeReadingDays(acc, d) }), inc);
      const unchanged = merged.secondsRead === inc.secondsRead && merged.pagesRead.length === inc.pagesRead.length;
      if (unchanged) plan.accept.push(incoming);
      else plan.push.push({ ...merged, updatedAt: stamp() } as unknown as T);
      return plan;
    }
    if (table === 'adhkarDays') {
      const days = [same, ...others].filter((r): r is T => r !== undefined) as unknown as AdhkarDayRecord[];
      const inc = incoming as AdhkarDayRecord;
      const merged = days.reduce((acc, d) => ({ ...acc, ...mergeAdhkarDays(acc, d) }), inc);
      const unchanged = merged.completed === inc.completed && stableStringify(merged.counts) === stableStringify(inc.counts);
      if (unchanged) plan.accept.push(incoming);
      else plan.push.push({ ...merged, updatedAt: stamp() } as unknown as T);
      return plan;
    }
    const winner = [same, ...others].reduce<T>((acc, r) => (r ? newer(acc, r) : acc), incoming);
    if (winner === incoming) plan.accept.push(incoming);
    else if (winner !== same) plan.push.push({ ...winner, id: incoming.id });
    return plan;
  }

  // Dedupe: the live incoming record and live local records for the same target.
  const current = same ? newer(incoming, same) : incoming;
  if (current === incoming) plan.accept.push(incoming);
  if (current.deletedAt !== null || others.length === 0) return plan;

  const group = [current, ...others];
  const canonicalId = group.map((r) => r.id).sort()[0]!;
  const latest = group.reduce((a, b) => newer(a, b));
  const createdAt = Math.min(...group.map((r) => r.createdAt));
  const now = stamp();
  const canonical =
    table === 'notes'
      ? ({ ...latest, id: canonicalId, createdAt, body: combineNoteBodies(group as unknown as NoteRecord[]), updatedAt: now } as unknown as T)
      : ({ ...(latest as SavedItemRecord), id: canonicalId, createdAt, updatedAt: now } as unknown as T);
  plan.push.push(canonical);
  for (const r of group) {
    if (r.id !== canonicalId) plan.push.push({ ...r, deletedAt: now, updatedAt: now });
  }
  plan.accept = plan.accept.filter((r) => !plan.push.some((p) => p.id === r.id));
  return plan;
}
