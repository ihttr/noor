// Compact navigation data for client-side jumps (surah/ayah, page, juz, hizb, quarter).
// Served once as a static JSON route; contains structure and names only, no Quran text.
import { ayahIndex, divisionAt } from './structure.ts';
import type { AyahRef, QuranMeta } from './types.ts';

export interface NavSurah {
  number: number;
  name: string;
  transliteration: string;
  englishName: string;
  ayahCount: number;
  startIndex: number;
  slug: string;
}

export interface NavData {
  surahs: NavSurah[];
  pages: { start: AyahRef }[];
  juz: { start: AyahRef }[];
  quarters: { start: AyahRef }[];
}

export function toNavData(meta: QuranMeta, slugOf: (surah: number) => string): NavData {
  const starts = (list: { start: AyahRef }[]) => list.map((d) => ({ start: d.start }));
  return {
    surahs: meta.surahs.map((s) => ({
      number: s.number,
      name: s.name,
      transliteration: s.transliteration,
      englishName: s.englishName,
      ayahCount: s.ayahCount,
      startIndex: s.startIndex,
      slug: slugOf(s.number),
    })),
    pages: starts(meta.pages),
    juz: starts(meta.juz),
    quarters: starts(meta.hizbQuarters),
  };
}

export type JumpTarget =
  | { kind: 'ayah'; surah: number; ayah?: number }
  | { kind: 'page' | 'juz' | 'hizb' | 'quarter'; number: number };

export type ReaderMode = 'reading' | 'mushaf';

export function pageOfRef(nav: NavData, ref: AyahRef): number {
  return divisionAt(nav, nav.pages, ayahIndex(nav, ref));
}

/** Resolves a jump to its first ayah, or null when the number is out of range. */
export function jumpStart(nav: NavData, target: JumpTarget): AyahRef | null {
  if (target.kind === 'ayah') {
    const surah = nav.surahs[target.surah - 1];
    const ayah = target.ayah ?? 1;
    return surah && ayah >= 1 && ayah <= surah.ayahCount ? { surah: target.surah, ayah } : null;
  }
  const list = target.kind === 'page' ? nav.pages : target.kind === 'juz' ? nav.juz : nav.quarters;
  const index = target.kind === 'hizb' ? (target.number - 1) * 4 : target.number - 1;
  if (!Number.isInteger(target.number) || target.number < 1) return null;
  return list[index]?.start ?? null;
}

export function readerHref(nav: NavData, ref: AyahRef, mode: ReaderMode): string {
  const anchor = `#ayah-${ref.surah}-${ref.ayah}`;
  if (mode === 'mushaf') return `/mushaf/page/${pageOfRef(nav, ref)}${anchor}`;
  return `/quran/${nav.surahs[ref.surah - 1]!.slug}${anchor}`;
}
