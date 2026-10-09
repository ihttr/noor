// The local-first store as features see it (SPEC §5, D-042). Features depend on this interface
// only; `dexie.ts` implements it on IndexedDB. Phase 9 adds a transport that calls `sync`.

import type { Grade } from '../memorize/srs.ts';
import type {
  AdhkarDayRecord,
  GoalRecord,
  MemorizationItemRecord,
  Change,
  CollectionRecord,
  ItemType,
  NoteRecord,
  PreferencesData,
  ReadingDayRecord,
  ReadingPosition,
  ReadingPositionRecord,
  SavedItemRecord,
  TableName,
  TableRecords,
  TasbihSessionRecord,
} from './types.ts';

export interface PreferencesRepository {
  get(): Promise<PreferencesData | undefined>;
  /** Shallow-merges `patch` into the stored blob. */
  update(patch: Partial<PreferencesData>): Promise<PreferencesData>;
}

export interface PositionRepository {
  get(): Promise<ReadingPositionRecord | undefined>;
  set(position: ReadingPosition): Promise<void>;
}

export interface ReadingDayRepository {
  get(date: string): Promise<ReadingDayRecord | undefined>;
  /** Adds read pages (each counted once per day) and reading seconds to a local day. */
  record(date: string, activity: { pages?: readonly number[]; seconds?: number }): Promise<void>;
  /** Days from `from` to `to` inclusive (`YYYY-MM-DD`), oldest first. */
  list(from?: string, to?: string): Promise<ReadingDayRecord[]>;
}

export interface SavedRepository {
  /** Live saved items, newest first. */
  list(): Promise<SavedItemRecord[]>;
  find(type: ItemType, ref: string): Promise<SavedItemRecord | undefined>;
  /** Saves a target (idempotent; revives a deleted record of the same target). */
  save(type: ItemType, ref: string, collectionId?: string | null): Promise<SavedItemRecord>;
  setCollection(id: string, collectionId: string | null): Promise<void>;
  remove(id: string): Promise<void>;
}

export interface CollectionRepository {
  /** Live collections in their order. */
  list(): Promise<CollectionRecord[]>;
  create(name: string): Promise<CollectionRecord>;
  rename(id: string, name: string): Promise<void>;
  /** Moves a collection one place up (-1) or down (+1). */
  move(id: string, step: -1 | 1): Promise<void>;
  /** Deletes a collection; its items stay saved without a collection. */
  remove(id: string): Promise<void>;
}

export interface NoteRepository {
  /** Live notes, newest first. */
  list(): Promise<NoteRecord[]>;
  get(targetType: ItemType, targetRef: string): Promise<NoteRecord | undefined>;
  /** Creates or replaces the note of a target; an empty body deletes it. */
  set(targetType: ItemType, targetRef: string, body: string): Promise<NoteRecord | undefined>;
  remove(id: string): Promise<void>;
}

export interface AdhkarRepository {
  get(date: string, categoryId: string): Promise<AdhkarDayRecord | undefined>;
  /** Saves one dhikr's count for the day (every tap, SPEC §7.14) and whether the category is complete. */
  setCount(date: string, categoryId: string, dhikrId: string, count: number, completed: boolean): Promise<void>;
  /** Days from `from` to `to` inclusive, oldest first. */
  list(from?: string, to?: string): Promise<AdhkarDayRecord[]>;
}

export interface TasbihRepository {
  /** The running session (latest one not ended). */
  current(): Promise<TasbihSessionRecord | undefined>;
  /** Ends the running session and starts a new one. */
  start(phrase: string, target: number | null): Promise<TasbihSessionRecord>;
  update(id: string, patch: { count?: number; target?: number | null }): Promise<void>;
  end(id: string): Promise<void>;
  /** Latest sessions, newest first (SPEC §7.15: last 30). */
  history(limit?: number): Promise<TasbihSessionRecord[]>;
}

export interface MemorizationRepository {
  /** Live items, by surah and ayah. */
  list(): Promise<MemorizationItemRecord[]>;
  /** Adds ayahs of a surah (ayahs already in memorization keep their progress); returns how many were added. */
  add(surah: number, ayahs: readonly number[]): Promise<number>;
  /** Records a self-assessment (SPEC §7.12) and reschedules the ayah. */
  review(surah: number, ayah: number, grade: Grade): Promise<MemorizationItemRecord>;
  /** Removes ayahs `from`–`to` of a surah from memorization (the whole surah by default). */
  remove(surah: number, from?: number, to?: number): Promise<void>;
}

export interface GoalRepository {
  /** Live goals, oldest start date first. */
  list(): Promise<GoalRecord[]>;
  /** Sets the daily goal in pages from `date` on (0 = no goal). */
  set(amount: number, date: string): Promise<GoalRecord>;
}

/**
 * Values that stay on this device and are never synced (SPEC §5: the prayer location stays on
 * the device unless the user opts in).
 */
export interface DeviceRepository {
  get<T>(key: string): Promise<T | undefined>;
  set(key: string, value: unknown): Promise<void>;
  remove(key: string): Promise<void>;
}

/** What the Phase 9 transport needs: local changes out, remote changes in, a cursor. */
export interface SyncPort {
  /** Records changed on this device that the server has not acknowledged yet. */
  pending(): Promise<Change[]>;
  /** Drops acknowledged changes from the queue (unless the record changed again since). */
  acknowledge(changes: readonly Change[]): Promise<void>;
  /** Applies records from the server with the merge rules of merge.ts. */
  applyRemote(changes: readonly Change[]): Promise<void>;
  getCursor(): Promise<string | null>;
  setCursor(cursor: string | null): Promise<void>;
  /** Deletes all synced data, the upload queue and the cursor (another account signs in). */
  reset(): Promise<void>;
  /**
   * Forgets the account but keeps the data as guest data (after "Delete my account"): drops
   * tombstones and the cursor and queues every live record for upload again.
   */
  detach(): Promise<void>;
}

export interface LocalStore {
  readonly preferences: PreferencesRepository;
  readonly position: PositionRepository;
  readonly readingDays: ReadingDayRepository;
  readonly saved: SavedRepository;
  readonly collections: CollectionRepository;
  readonly notes: NoteRepository;
  readonly adhkar: AdhkarRepository;
  readonly tasbih: TasbihRepository;
  readonly memorization: MemorizationRepository;
  readonly goals: GoalRepository;
  readonly device: DeviceRepository;
  readonly sync: SyncPort;
  /** Every record of every synced table, tombstones included (for "Export my data"). */
  dump(): Promise<Record<TableName, TableRecords[TableName][]>>;
  /** Calls `listener` after changes to any of `tables`, made in this tab or another one. */
  subscribe(tables: readonly (TableName | 'device')[], listener: () => void): () => void;
  close(): void;
}

export class StoreInputError extends Error {
  override name = 'StoreInputError';
}
