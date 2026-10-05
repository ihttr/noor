// Arabic normalization for the SEARCH INDEX and search queries only (SPEC §7.8).
// Its output is never displayed as Quran, and it must never be applied to the Quran text in
// content/quran (CLAUDE.md). It deliberately does not use String.prototype.normalize.

/** Version of the rules below; stored in the search index so stale indexes are detectable. */
export const NORMALIZATION_VERSION = 1;

export const NORMALIZATION_RULES: readonly string[] = [
  'remove tashkeel and Quranic annotation marks (U+0610–U+061A, U+064B–U+065F, U+0670, U+06D6–U+06ED)',
  'remove tatweel (U+0640)',
  'أ إ آ ٱ → ا',
  'ة → ه',
  'ى → ي',
  'ؤ → و',
  'ئ → ي',
  'ه is never converted to ة',
];

const MARKS = /[ؐ-ًؚ-ٰٟۖ-ۭـ]/gu;

const LETTERS: Readonly<Record<string, string>> = {
  'أ': 'ا', // أ → ا
  'إ': 'ا', // إ → ا
  'آ': 'ا', // آ → ا
  'ٱ': 'ا', // ٱ → ا
  'ة': 'ه', // ة → ه
  'ى': 'ي', // ى → ي
  'ؤ': 'و', // ؤ → و
  'ئ': 'ي', // ئ → ي
};
const LETTER_RE = /[أإآٱةىؤئ]/gu;

/** Character-level normalization (no whitespace changes). */
export function normalizeArabic(text: string): string {
  return text.replace(MARKS, '').replace(LETTER_RE, (ch) => LETTERS[ch] ?? ch);
}

/** Arabic-Indic (٠–٩) and Eastern Arabic-Indic (۰–۹) digits → ASCII digits. */
export function toAsciiDigits(text: string): string {
  return text.replace(/[٠-٩۰-۹]/gu, (d) => {
    const code = d.charCodeAt(0);
    return String(code >= 0x06f0 ? code - 0x06f0 : code - 0x0660);
  });
}

/** Normalization for user queries: characters, digits and whitespace. */
export function normalizeQuery(text: string): string {
  return normalizeArabic(toAsciiDigits(text)).replace(/\s+/gu, ' ').trim();
}
