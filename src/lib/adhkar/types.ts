// Adhkar content in content/adhkar/ (SPEC §7.14). Every text comes verbatim from the approved
// dataset (D-055); Quranic passages are references, shown from the approved Quran text (D-019).

/** The twelve categories of SPEC §7.14, in display order. */
export const ADHKAR_CATEGORIES = [
  'morning',
  'evening',
  'after-prayer',
  'before-sleep',
  'upon-waking',
  'entering-mosque',
  'leaving-mosque',
  'before-eating',
  'after-eating',
  'travel',
  'distress',
  'general',
] as const;
export type AdhkarCategory = (typeof ADHKAR_CATEGORIES)[number];

export type DhikrPart = { kind: 'text'; text: string } | { kind: 'quran'; surah: number; from: number; to: number };

export interface Dhikr {
  /** `${category}:${order}` — also the DHIKR ref of saved items and notes. */
  id: string;
  order: number;
  /** Arabic text, split into dataset text and Quran references. */
  parts: DhikrPart[];
  /** Recommended repetitions. */
  count: number;
  /** Reference (book, number) as given by the dataset, with its grading when present (SPEC §2.7). */
  reference: { ar: string; en: string };
  /** The dataset's English translation (shown in the English UI). */
  translation: string;
}

export interface AdhkarSource {
  name: string;
  url: string;
  version: string;
  license: string;
  attribution: string;
  files: { path: string; sha256: string }[];
}

export interface AdhkarCategoryFile {
  schemaVersion: 1;
  id: AdhkarCategory;
  source: AdhkarSource;
  items: Dhikr[];
}

export interface AdhkarIndex {
  schemaVersion: 1;
  source: AdhkarSource;
  /** Every category of SPEC §7.14 with its number of adhkar (0 = no approved source yet). */
  categories: { id: AdhkarCategory; count: number }[];
}
