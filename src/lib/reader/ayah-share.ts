// Copy and share texts for an ayah (SPEC §7.5). The ayah text is used exactly as rendered (the
// DOM text equals the source, SPEC §2.6); only a reference line is added after it.

import type { NumeralStyle } from './settings.ts';

/** Whether ayah numbers use Arabic-Indic digits (D-039: `auto` follows the UI language). */
export function usesArabicDigits(numerals: NumeralStyle, locale: string): boolean {
  return numerals === 'arabic' || (numerals === 'auto' && locale === 'ar');
}

export function formatNumber(n: number, arabicDigits: boolean): string {
  return arabicDigits ? n.toLocaleString('ar-u-nu-arab', { useGrouping: false }) : String(n);
}

/** `[البقرة: ٢٥٥]` in Arabic, `[Al-Baqara 2:255]` in English. */
export function ayahReference(
  ref: { surahName: string; surah: number; ayah: number },
  locale: string,
  arabicDigits: boolean
): string {
  const n = (x: number) => formatNumber(x, arabicDigits);
  return locale === 'ar' ? `[${ref.surahName}: ${n(ref.ayah)}]` : `[${ref.surahName} ${n(ref.surah)}:${n(ref.ayah)}]`;
}

/** The ayah text, unchanged, followed by its reference on a new line. */
export function ayahCopyText(text: string, reference: string): string {
  return `${text}\n${reference}`;
}

/** Stable, shareable URL of an ayah (redirects to the reader anchor until ayah pages exist, D-037). */
export function ayahShareUrl(origin: string, locale: string, slug: string, ayah: number): string {
  return `${origin}${locale === 'ar' ? '' : `/${locale}`}/quran/${slug}/${ayah}`;
}
