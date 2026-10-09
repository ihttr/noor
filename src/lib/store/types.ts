// User-data records of the local-first store (SPEC §5, DECISIONS D-042).
//
// Every record is created on the device first and has the sync-ready shape: a client-generated
// UUID, `updatedAt` (last-write-wins key) and a `deletedAt` tombstone. Timestamps are epoch
// milliseconds from the store's hybrid clock (D-016); the Phase 9 transport converts them to the
// Prisma `DateTime` columns. Field names follow prisma/schema.prisma.

import type { ReaderSettings } from '../reader/settings.ts';
import type { ThemePreference } from '../theme.ts';
import type { Place } from '../cities/types.ts';
import type { MaskMode } from '../memorize/mask.ts';
import type { PrayerSettings } from '../prayer/times.ts';

export const ITEM_TYPES = ['AYAH', 'PAGE', 'SURAH', 'DHIKR', 'TAFSIR'] as const;
/** Target of a saved item or a note (Prisma `ItemType`). */
export type ItemType = (typeof ITEM_TYPES)[number];

/** Prisma `ReadingMode`. */
export type StoredReadingMode = 'READING' | 'MUSHAF';

export interface SyncRecord {
  /** Client-generated UUID. */
  id: string;
  createdAt: number;
  /** Hybrid-clock timestamp of the last change; last write wins (D-043). */
  updatedAt: number;
  /** Tombstone: when the record was deleted, else null. Tombstones are kept for sync. */
  deletedAt: number | null;
}

/** The `UserPreferences.data` blob. Open for later settings (prayer method, numerals…). */
export interface PreferencesData {
  reader?: ReaderSettings;
  theme?: ThemePreference;
  /** Audio player choices (SPEC §7.11). */
  audio?: { reciter: string; speed: number; autoScroll: boolean };
  /** Tasbih feedback (SPEC §7.15): vibration where supported, sound off by default. */
  tasbih?: { vibrate: boolean; sound: boolean };
  /** Adhkar: scroll to the next dhikr when one is complete (SPEC §7.14, off by default). */
  adhkar?: { autoAdvance: boolean };
  /** Prayer calculation settings (no location: that stays on the device, SPEC §5). */
  prayer?: PrayerSettings;
  /** Hijri calendar adjustment in days, −2…+2 (SPEC §7.18). */
  hijriAdjust?: number;
  /** The prayer location, only when the user opted in to syncing it (SPEC §5); null = not shared. */
  prayerPlace?: Place | null;
  /** Memorization practice mask (SPEC §7.12). */
  memorize?: { mask: MaskMode };
  /** Statistics page: the streak display can be hidden (SPEC §7.13). */
  stats?: { showStreak: boolean };
}

export interface PreferencesRecord extends SyncRecord {
  data: PreferencesData;
}

export interface ReadingPosition {
  surah: number;
  ayah: number;
  page: number;
  mode: StoredReadingMode;
}

export interface ReadingPositionRecord extends SyncRecord, ReadingPosition {}

export interface ReadingDayRecord extends SyncRecord {
  /** Local calendar day, `YYYY-MM-DD`. */
  date: string;
  /** Madani page numbers read that day, ascending, each once (SPEC §7.7). */
  pagesRead: number[];
  secondsRead: number;
}

export interface CollectionRecord extends SyncRecord {
  name: string;
  order: number;
}

/**
 * `ref` formats: AYAH `2:255`, PAGE `50`, SURAH `18`; DHIKR and TAFSIR refs are defined by the
 * phases that add them. Notes are separate records (one per target, D-046); the Prisma
 * `SavedItem.note` column is not used.
 */
export interface SavedItemRecord extends SyncRecord {
  type: ItemType;
  ref: string;
  collectionId: string | null;
}

export interface NoteRecord extends SyncRecord {
  targetType: ItemType;
  targetRef: string;
  body: string;
}

/** Today's counts of one adhkar category (Prisma `AdhkarDay`). Unique per local date + category. */
export interface AdhkarDayRecord extends SyncRecord {
  date: string;
  categoryId: string;
  /** dhikr id → count reached that day. */
  counts: Record<string, number>;
  completed: boolean;
}

/** A tasbih session (Prisma `TasbihSession`); `phrase` is a preset key or the user's own text. */
export interface TasbihSessionRecord extends SyncRecord {
  phrase: string;
  count: number;
  target: number | null;
  startedAt: number;
  endedAt: number | null;
}

/** Prisma `MemorizationStatus` (SPEC §7.12, D-065). */
export type MemorizationStatus = 'NEW' | 'LEARNING' | 'REVIEWING' | 'MEMORIZED';

/** One ayah in memorization, with its SM-2-style schedule. Unique per surah + ayah. */
export interface MemorizationItemRecord extends SyncRecord {
  surah: number;
  ayah: number;
  status: MemorizationStatus;
  ease: number;
  intervalDays: number;
  /** Consecutive successful reviews. */
  repetitions: number;
  /** Start of the local day the ayah is due again (epoch ms). */
  dueAt: number;
  lastReviewedAt: number | null;
}

/** A daily reading goal in pages, valid from `activeFrom` (local date) until the next one. 0 = none. */
export interface GoalRecord extends SyncRecord {
  unit: 'PAGES';
  amount: number;
  activeFrom: string;
}

export interface TableRecords {
  preferences: PreferencesRecord;
  readingPositions: ReadingPositionRecord;
  readingDays: ReadingDayRecord;
  collections: CollectionRecord;
  savedItems: SavedItemRecord;
  notes: NoteRecord;
  adhkarDays: AdhkarDayRecord;
  tasbihSessions: TasbihSessionRecord;
  memorizationItems: MemorizationItemRecord;
  goals: GoalRecord;
}

export type TableName = keyof TableRecords;

export const TABLE_NAMES: readonly TableName[] = [
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

/** One record as it travels between the device and the server (Phase 9). */
export type Change = { [N in TableName]: { table: N; record: TableRecords[N] } }[TableName];

export const NOTE_MAX_LENGTH = 5000;
export const TASBIH_PHRASE_MAX_LENGTH = 120;
export const COLLECTION_NAME_MAX_LENGTH = 60;
/** Daily goal limit: the whole Mushaf in a day. */
export const GOAL_MAX_PAGES = 604;
