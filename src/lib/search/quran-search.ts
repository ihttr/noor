// Quran search (SPEC §7.8). Query and index are normalized with the same rules (tashkeel and
// tatweel removed, أ إ آ ٱ → ا, ة → ه, ى → ي, ؤ → و, ئ → ي). The index is the normalized Simple
// Clean text: it is only searched, never displayed. Results carry the matched word positions,
// which the result list maps back to words of the Uthmani text (highlight.ts).

import { normalizeQuery } from '../quran/normalize.ts';

/**
 * - `phrase`: the query's words appear consecutively as whole words.
 * - `partial`: the query appears anywhere, also inside words ("كهف" finds "الكهف").
 * - `all`: every query word appears (also inside words), in any order.
 */
export const SEARCH_MODES = ['phrase', 'partial', 'all'] as const;
export type SearchMode = (typeof SEARCH_MODES)[number];

export interface IndexedAyah {
  key: string;
  surah: number;
  ayah: number;
  juz: number;
  /** Normalized Simple Clean text (single spaces). */
  text: string;
  words: string[];
  /** Start offset of each word in `text`. */
  starts: number[];
}

export interface SearchOptions {
  mode: SearchMode;
  surah?: number;
  juz?: number;
}

export interface SearchHit {
  key: string;
  surah: number;
  ayah: number;
  /** Matched word positions in the Simple Clean word list. */
  words: number[];
  /** Number of words in the Simple Clean text (to check the mapping onto the Uthmani words). */
  wordCount: number;
}

export function indexAyahs(entries: readonly (readonly [string, string])[], juzOf: (index: number) => number): IndexedAyah[] {
  return entries.map(([key, raw], i) => {
    const [surah = 0, ayah = 0] = key.split(':').map(Number);
    const words = raw.split(' ').filter(Boolean);
    const text = words.join(' ');
    const starts: number[] = [];
    let offset = 0;
    for (const w of words) {
      starts.push(offset);
      offset += w.length + 1;
    }
    return { key, surah, ayah, juz: juzOf(i), text, words, starts };
  });
}

function occurrences(haystack: string, needle: string): number[] {
  const found: number[] = [];
  for (let i = haystack.indexOf(needle); i !== -1; i = haystack.indexOf(needle, i + 1)) found.push(i);
  return found;
}

/** Words of `a` overlapping the character range [from, to). */
function wordsInRange(a: IndexedAyah, from: number, to: number): number[] {
  const out: number[] = [];
  for (let w = 0; w < a.words.length; w++) {
    const start = a.starts[w]!;
    const end = start + a.words[w]!.length;
    if (end > from && start < to) out.push(w);
  }
  return out;
}

function match(a: IndexedAyah, query: string[], joined: string, mode: SearchMode): number[] | null {
  const words = new Set<number>();
  if (mode === 'phrase') {
    for (let i = 0; i + query.length <= a.words.length; i++) {
      if (query.every((q, k) => a.words[i + k] === q)) query.forEach((_, k) => words.add(i + k));
    }
  } else if (mode === 'partial') {
    for (const at of occurrences(a.text, joined)) wordsInRange(a, at, at + joined.length).forEach((w) => words.add(w));
  } else {
    for (const q of query) {
      const hits = a.words.flatMap((w, i) => (w.includes(q) ? [i] : []));
      if (!hits.length) return null;
      hits.forEach((w) => words.add(w));
    }
  }
  return words.size ? [...words].sort((x, y) => x - y) : null;
}

export function searchQuran(
  index: readonly IndexedAyah[],
  rawQuery: string,
  options: SearchOptions,
  limit = Number.POSITIVE_INFINITY
): { total: number; hits: SearchHit[]; query: string } {
  const query = normalizeQuery(rawQuery).split(' ').filter(Boolean);
  const joined = query.join(' ');
  const hits: SearchHit[] = [];
  let total = 0;
  if (!query.length) return { total, hits, query: joined };
  for (const a of index) {
    if (options.surah && a.surah !== options.surah) continue;
    if (options.juz && a.juz !== options.juz) continue;
    const words = match(a, query, joined, options.mode);
    if (!words) continue;
    total++;
    if (hits.length < limit) hits.push({ key: a.key, surah: a.surah, ayah: a.ayah, words, wordCount: a.words.length });
  }
  return { total, hits, query: joined };
}
