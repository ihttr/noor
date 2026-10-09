// The Saved page lists one entry per target (ayah, page, surah…): the saved item and/or the note
// attached to it (SPEC §7.6, D-046). Pure helpers, unit-tested.

import { normalizeQuery } from '../quran/normalize.ts';
import type { ItemType, NoteRecord, SavedItemRecord } from '../store/types.ts';

export interface SavedEntry {
  /** `${type}|${ref}` */
  id: string;
  type: ItemType;
  ref: string;
  saved?: SavedItemRecord;
  note?: NoteRecord;
  /** Latest of "saved at" and "note edited at", for newest-first order. */
  time: number;
}

export function buildEntries(saved: readonly SavedItemRecord[], notes: readonly NoteRecord[]): SavedEntry[] {
  const entries = new Map<string, SavedEntry>();
  const entry = (type: ItemType, ref: string) => {
    const id = `${type}|${ref}`;
    let e = entries.get(id);
    if (!e) entries.set(id, (e = { id, type, ref, time: 0 }));
    return e;
  };
  for (const s of saved) {
    if (s.deletedAt !== null) continue;
    const e = entry(s.type, s.ref);
    e.saved = s;
    e.time = Math.max(e.time, s.createdAt);
  }
  for (const n of notes) {
    if (n.deletedAt !== null) continue;
    const e = entry(n.targetType, n.targetRef);
    e.note = n;
    e.time = Math.max(e.time, n.updatedAt);
  }
  return [...entries.values()].sort((a, b) => b.time - a.time || (a.id < b.id ? -1 : 1));
}

/** A type, every entry, or only entries with a note. */
export type TypeFilter = ItemType | 'ALL' | 'NOTES';
/** Every entry, entries without a collection, or a collection id. */
export type CollectionFilter = 'ALL' | 'NONE' | (string & {});

export interface SavedFilter {
  type: TypeFilter;
  collection: CollectionFilter;
  query: string;
}

export const NO_FILTER: SavedFilter = { type: 'ALL', collection: 'ALL', query: '' };

/** Search folding for user text and labels (never applied to displayed Quran text). */
export function foldForSearch(text: string): string {
  return normalizeQuery(text).toLowerCase();
}

export function filterEntries(
  entries: readonly SavedEntry[],
  filter: SavedFilter,
  searchText: (entry: SavedEntry) => string
): SavedEntry[] {
  // Every word of the query must appear (in any order): "البقره ٢٥٦", "kahf note".
  const words = foldForSearch(filter.query).split(' ').filter(Boolean);
  return entries.filter((e) => {
    if (filter.type === 'NOTES' ? !e.note : filter.type !== 'ALL' && e.type !== filter.type) return false;
    if (filter.collection !== 'ALL') {
      const collection = e.saved?.collectionId ?? null;
      if (filter.collection === 'NONE' ? collection !== null : collection !== filter.collection) return false;
    }
    if (!words.length) return true;
    const text = foldForSearch(searchText(e));
    return words.every((w) => text.includes(w));
  });
}

/** Entry counts per type filter, for the filter chips. */
export function countByType(entries: readonly SavedEntry[]): Record<TypeFilter, number> {
  const counts: Record<TypeFilter, number> = { ALL: entries.length, NOTES: 0, AYAH: 0, PAGE: 0, SURAH: 0, DHIKR: 0, TAFSIR: 0 };
  for (const e of entries) {
    counts[e.type]++;
    if (e.note) counts.NOTES++;
  }
  return counts;
}
