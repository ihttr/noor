// Client-side loaders for the static content routes, fetched once per page session.
// Texts arrive exactly as stored in content/ (JSON keeps every code point).

import type { TafsirSurahFile } from '../tafsir/types.ts';
import type { TranslationSurahFile } from '../translations/types.ts';
import type { NavData } from './nav.ts';
import type { SurahFile } from './types.ts';

const cache = new Map<string, Promise<unknown>>();

function load<T>(url: string): Promise<T> {
  let p = cache.get(url) as Promise<T> | undefined;
  if (!p) {
    p = fetch(url).then((r) => {
      if (!r.ok) throw new Error(`${url}: ${r.status}`);
      return r.json() as Promise<T>;
    });
    // A failed request (offline) may be retried later.
    p.catch(() => cache.delete(url));
    cache.set(url, p);
  }
  return p;
}

/** Surah names, slugs and structure (no Quran text). */
export const loadNav = () => load<NavData>('/api/quran/nav');

/** One surah chunk with its verbatim ayahs and the Tanzil notice. */
export const loadSurahFile = (surah: number) => load<SurahFile>(`/api/quran/surah/${surah}`);

/** One surah of an imported tafsir, with its source. */
export const loadTafsirSurah = (id: string, surah: number) => load<TafsirSurahFile>(`/api/tafsir/${id}/${surah}`);

/** One surah of an imported translation, with its translator and source. */
export const loadTranslationSurah = (id: string, surah: number) => load<TranslationSurahFile>(`/api/translations/${id}/${surah}`);
