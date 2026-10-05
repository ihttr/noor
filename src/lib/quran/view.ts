// Server-side helpers that prepare a reader view (surah, juz, Mushaf page) for rendering.
import { getMeta, getSurah } from './content.ts';
import { slugOf } from './slugs.ts';
import { ayahKey } from './structure.ts';
import type { AyahWithRef, QuranMeta } from './types.ts';

export interface ReaderView {
  meta: QuranMeta;
  ayahs: AyahWithRef[];
  bismillah: Record<number, string | null>;
  quarterStarts: Map<string, number>;
  surahNames: Record<number, string>;
  surahSlugs: Record<number, string>;
  initialInfo: { surah: number; page: number; juz: number; hizb: number };
}

/** Builds everything QuranFlow and ReaderShell need for a list of ayahs. */
export async function readerView(ayahs: AyahWithRef[], locale: string): Promise<ReaderView> {
  const meta = await getMeta();
  const surahNumbers = [...new Set(ayahs.map((a) => a.surah))];
  const bismillah: Record<number, string | null> = {};
  for (const n of surahNumbers) {
    if (ayahs.some((a) => a.surah === n && a.number === 1)) bismillah[n] = (await getSurah(n)).bismillah;
  }
  const first = ayahs[0];
  if (!first) throw new Error('Empty reader view');
  return {
    meta,
    ayahs,
    bismillah,
    quarterStarts: new Map(meta.hizbQuarters.map((q) => [ayahKey(q.start), q.number])),
    surahNames: Object.fromEntries(surahNumbers.map((n) => [n, surahDisplayName(meta, n, locale)])),
    surahSlugs: Object.fromEntries(surahNumbers.map((n) => [n, slugOf(n)])),
    initialInfo: { surah: first.surah, page: first.page, juz: first.juz, hizb: first.hizb },
  };
}

/** All ayahs of a surah with their keys. */
export async function surahAyahs(surah: number): Promise<AyahWithRef[]> {
  const file = await getSurah(surah);
  return file.ayahs.map((a) => ({ ...a, surah, key: ayahKey({ surah, ayah: a.number }) }));
}

/** Surah name for UI labels: Tanzil's Arabic name, or its transliteration in English. */
export function surahDisplayName(meta: QuranMeta, surah: number, locale: string): string {
  const s = meta.surahs[surah - 1]!;
  return locale === 'ar' ? s.name : s.transliteration;
}
