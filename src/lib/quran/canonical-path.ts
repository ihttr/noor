import { toAsciiDigits } from './normalize.ts';
import { resolveSurahParam, slugOf } from './slugs.ts';

// /quran/2 and /quran/2/255 (also /quran/al-baqara/٢٥٥ or /0255) → the canonical slug URLs with a
// 308 (SPEC §9), answered here before any page renders.
const QURAN_PATH = /^(\/en)?\/quran\/([^/]+)(?:\/([^/]+))?\/?$/;

/** The canonical path for a non-canonical Quran URL, or null when it is canonical or unknown. */
export function canonicalQuranPath(pathname: string): string | null {
  const m = QURAN_PATH.exec(pathname);
  if (!m) return null;
  let param: string;
  try {
    param = decodeURIComponent(m[2]!);
  } catch {
    return null;
  }
  const resolved = resolveSurahParam(toAsciiDigits(param));
  if (!resolved) return null;
  let canonical = resolved.canonical && param === m[2];
  let ayahPart = '';
  if (m[3] !== undefined) {
    let raw: string;
    try {
      raw = decodeURIComponent(m[3]);
    } catch {
      return null;
    }
    const ayah = Number(toAsciiDigits(raw));
    if (!/^[0-9٠-٩۰-۹]{1,6}$/u.test(raw) || !Number.isInteger(ayah) || ayah < 1) return null; // the page answers 404
    ayahPart = `/${ayah}`;
    if (String(ayah) !== m[3]) canonical = false;
  }
  return canonical ? null : `${m[1] ?? ''}/quran/${slugOf(resolved.surah)}${ayahPart}`;
}
