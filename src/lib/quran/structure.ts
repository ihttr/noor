// Pure lookups over the Quran structure (no I/O). Used by the import script and the app.
import type { AyahKey, AyahRef, QuranMeta, SurahMeta } from './types.ts';

export const SURAH_COUNT = 114;
export const AYAH_COUNT = 6236;
export const PAGE_COUNT = 604;
export const JUZ_COUNT = 30;
export const HIZB_COUNT = 60;
export const HIZB_QUARTER_COUNT = 240;

/** The minimal structure the lookups need (meta.json satisfies it). */
type Structure = { surahs: readonly Pick<SurahMeta, 'number' | 'ayahCount' | 'startIndex'>[] };

export function ayahKey(ref: AyahRef): AyahKey {
  return `${ref.surah}:${ref.ayah}`;
}

export function isValidRef(meta: Structure, ref: AyahRef): boolean {
  const surah = meta.surahs[ref.surah - 1];
  return Number.isInteger(ref.ayah) && surah !== undefined && ref.ayah >= 1 && ref.ayah <= surah.ayahCount;
}

/** 0-based position of an ayah in Mushaf order (0 … 6235). */
export function ayahIndex(meta: Structure, ref: AyahRef): number {
  if (!isValidRef(meta, ref)) throw new RangeError(`Invalid ayah reference ${ayahKey(ref)}`);
  return meta.surahs[ref.surah - 1]!.startIndex + ref.ayah - 1;
}

export function refAtIndex(meta: Structure, index: number): AyahRef {
  let lo = 0;
  let hi = meta.surahs.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (meta.surahs[mid]!.startIndex <= index) lo = mid;
    else hi = mid - 1;
  }
  const surah = meta.surahs[lo]!;
  const ref = { surah: surah.number, ayah: index - surah.startIndex + 1 };
  if (!isValidRef(meta, ref)) throw new RangeError(`Invalid ayah index ${index}`);
  return ref;
}

export interface AyahRange {
  start: AyahRef;
  end: AyahRef;
}

/**
 * Range of the n-th (1-based) division, given the start of every division in order
 * (pages, juz, hizb quarters). The range ends just before the next division starts.
 */
export function divisionRange(meta: Structure, starts: readonly { start: AyahRef }[], n: number): AyahRange {
  const division = starts[n - 1];
  if (!Number.isInteger(n) || division === undefined) throw new RangeError(`No division ${n}`);
  const next = starts[n];
  const totalAyahs = meta.surahs.reduce((sum, s) => sum + s.ayahCount, 0);
  const endIndex = next ? ayahIndex(meta, next.start) - 1 : totalAyahs - 1;
  return { start: division.start, end: refAtIndex(meta, endIndex) };
}

/** 1-based number of the division that contains the ayah at `index`. */
export function divisionAt(meta: Structure, starts: readonly { start: AyahRef }[], index: number): number {
  let lo = 0;
  let hi = starts.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (ayahIndex(meta, starts[mid]!.start) <= index) lo = mid;
    else hi = mid - 1;
  }
  return lo + 1;
}

export function pageRange(meta: QuranMeta, page: number): AyahRange {
  return divisionRange(meta, meta.pages, page);
}

export function juzRange(meta: QuranMeta, juz: number): AyahRange {
  return divisionRange(meta, meta.juz, juz);
}

export function hizbQuarterRange(meta: QuranMeta, quarter: number): AyahRange {
  return divisionRange(meta, meta.hizbQuarters, quarter);
}

export function hizbRange(meta: QuranMeta, hizb: number): AyahRange {
  if (!Number.isInteger(hizb) || hizb < 1 || hizb > HIZB_COUNT) throw new RangeError(`No hizb ${hizb}`);
  const first = hizbQuarterRange(meta, (hizb - 1) * 4 + 1);
  const last = hizbQuarterRange(meta, hizb * 4);
  return { start: first.start, end: last.end };
}
