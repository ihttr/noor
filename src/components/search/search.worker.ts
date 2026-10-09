// Web Worker: loads the search index once and answers queries in memory (SPEC §7.8), so typing
// never blocks the page. Also works offline once the index is cached (Phase 11).
import { indexAyahs, searchQuran, type IndexedAyah, type SearchMode } from '@/lib/search/quran-search';

export interface SearchRequest {
  id: number;
  query: string;
  mode: SearchMode;
  surah?: number;
  juz?: number;
  limit: number;
}

export type SearchResponse =
  | { id: number; ok: true; total: number; hits: ReturnType<typeof searchQuran>['hits']; query: string }
  | { id: number; ok: false };

let index: Promise<IndexedAyah[]> | undefined;

function load(): Promise<IndexedAyah[]> {
  index ??= fetch('/api/quran/search-index')
    .then((r) => {
      if (!r.ok) throw new Error(`search index ${r.status}`);
      return r.json() as Promise<{ entries: [string, string][]; juz: number[] }>;
    })
    .then((data) => indexAyahs(data.entries, (i) => data.juz[i] ?? 0))
    .catch((error: unknown) => {
      index = undefined;
      throw error;
    });
  return index;
}

self.onmessage = async (e: MessageEvent<SearchRequest>) => {
  const { id, query, mode, surah, juz, limit } = e.data;
  try {
    const result = searchQuran(await load(), query, { mode, surah, juz }, limit);
    (self as unknown as Worker).postMessage({ id, ok: true, ...result } satisfies SearchResponse);
  } catch {
    (self as unknown as Worker).postMessage({ id, ok: false } satisfies SearchResponse);
  }
};
