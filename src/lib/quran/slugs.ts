// Surah URL slugs from the curated data/curated/surah-slugs.json (D-037). URL labels only.
import file from '../../../data/curated/surah-slugs.json';

const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

const slugs: readonly string[] = file.surahs.map((s, i) => {
  if (s.number !== i + 1 || !SLUG_PATTERN.test(s.slug)) throw new Error(`Invalid slug entry for surah ${i + 1}`);
  return s.slug;
});
if (slugs.length !== 114 || new Set(slugs).size !== 114) throw new Error('surah-slugs.json must hold 114 unique slugs');

const bySlug = new Map(slugs.map((slug, i) => [slug, i + 1]));

export function slugOf(surah: number): string {
  const slug = slugs[surah - 1];
  if (!slug) throw new RangeError(`No surah ${surah}`);
  return slug;
}

export function allSlugs(): readonly string[] {
  return slugs;
}

/** Resolves a `[surah]` route param: a slug (canonical) or a number 1–114 (to be redirected). */
export function resolveSurahParam(param: string): { surah: number; canonical: boolean } | null {
  const fromSlug = bySlug.get(param);
  if (fromSlug) return { surah: fromSlug, canonical: true };
  if (/^\d{1,3}$/.test(param)) {
    const n = Number(param);
    if (n >= 1 && n <= 114) return { surah: n, canonical: false };
  }
  return null;
}

export function surahHref(surah: number, ayah?: number): string {
  return ayah ? `/quran/${slugOf(surah)}#ayah-${surah}-${ayah}` : `/quran/${slugOf(surah)}`;
}
