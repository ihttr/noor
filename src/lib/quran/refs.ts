// Parsing of ayah references typed by users: "2:255", "٢:٢٥٥", "البقرة ٢٥٥", "سورة الكهف 10",
// "Al-Kahf 10", "18" (SPEC §7.8 command palette, §15). Pure; surah names come from meta.json.
import { normalizeArabic, toAsciiDigits } from './normalize.ts';
import type { SurahMeta } from './types.ts';

export interface ParsedRef {
  surah: number;
  /** Absent when only a surah was given. */
  ayah?: number;
}

type SurahNames = Pick<SurahMeta, 'number' | 'name' | 'transliteration' | 'ayahCount'>;

const ARABIC_LETTER = /[ء-يٱ]/u;

function arabicKey(name: string): string {
  return normalizeArabic(name).replace(/\s+/gu, '');
}

/** Arabic surah-name forms that match: with and without the article ال. */
function arabicForms(name: string): string[] {
  const key = arabicKey(name);
  return key.startsWith('ال') && key.length > 3 ? [key, key.slice(2)] : [key];
}

function latinKey(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z]/g, '')
    .replace(/([a-z])\1+/g, '$1') // aa → a, ee → e (Tanzil spells long vowels doubled)
    .replace(/(?<=[aeiu])h$/, ''); // baqarah → baqara
}

/** Latin surah-name forms: with and without the article (Al-, An-, Ash-, Aal-i-, …). */
function latinForms(transliteration: string): string[] {
  const full = latinKey(transliteration);
  const withoutArticle = transliteration.replace(/^(a{1,2}[a-z]{0,2}-(i-)?)/i, '');
  const short = latinKey(withoutArticle);
  return short && short !== full ? [full, short] : [full];
}

function findSurah(surahs: readonly SurahNames[], rawName: string): SurahNames | undefined {
  const name = rawName.replace(/^\s*(سورة|سوره|surah|sura|surat)\s+/iu, '').trim();
  if (!name) return undefined;
  if (ARABIC_LETTER.test(name)) {
    const forms = arabicForms(name);
    return surahs.find((s) => arabicForms(s.name).some((f) => forms.includes(f)));
  }
  const forms = latinForms(name);
  return surahs.find((s) => latinForms(s.transliteration).some((f) => forms.includes(f)));
}

function validated(surahs: readonly SurahNames[], surahNumber: number, ayah?: number): ParsedRef | null {
  const surah = surahs[surahNumber - 1];
  if (!surah || surah.number !== surahNumber) return null;
  if (ayah === undefined) return { surah: surahNumber };
  return ayah >= 1 && ayah <= surah.ayahCount ? { surah: surahNumber, ayah } : null;
}

export function parseAyahRef(input: string, surahs: readonly SurahNames[]): ParsedRef | null {
  const text = toAsciiDigits(input).replace(/\s+/gu, ' ').trim();
  if (!text) return null;

  const numeric = /^(\d{1,3})(?:\s*[:：/.]\s*|\s+)(\d{1,3})$/u.exec(text);
  if (numeric) return validated(surahs, Number(numeric[1]), Number(numeric[2]));

  if (/^\d{1,3}$/u.test(text)) return validated(surahs, Number(text));

  const named = /^(.*?)[\s:：]*(\d{1,3})?$/u.exec(text);
  if (!named || !named[1]) return null;
  const surah = findSurah(surahs, named[1]);
  if (!surah) return null;
  return validated(surahs, surah.number, named[2] === undefined ? undefined : Number(named[2]));
}
