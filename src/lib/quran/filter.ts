// Instant surah filter (SPEC §7.2): "الكهف", "كهف", "kahf", "18" all find al-Kahf.
import { normalizeArabic, toAsciiDigits } from './normalize.ts';
import { latinKey } from './refs.ts';

export interface FilterableSurah {
  number: number;
  name: string;
  transliteration: string;
  englishName: string;
}

const ARABIC = /[ء-يٱ]/u;

const arabicFold = (s: string) => normalizeArabic(s).replace(/\s+/gu, '');

export function matchesSurah(query: string, surah: FilterableSurah): boolean {
  const q = toAsciiDigits(query).trim();
  if (!q) return true;
  if (/^\d+$/.test(q)) return String(surah.number).startsWith(q);
  if (ARABIC.test(q)) return arabicFold(surah.name).includes(arabicFold(q.replace(/^سور[ةه]\s*/u, '')));
  const key = latinKey(q);
  return (
    (key.length > 0 && latinKey(surah.transliteration).includes(key)) ||
    surah.englishName.toLowerCase().includes(q.toLowerCase())
  );
}
