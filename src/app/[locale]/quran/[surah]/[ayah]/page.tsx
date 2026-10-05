import { getLocale } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { redirect } from '@/i18n/navigation';
import { getMeta } from '@/lib/quran/content';
import { resolveSurahParam, surahHref } from '@/lib/quran/slugs';
import { toAsciiDigits } from '@/lib/quran/normalize';

// /quran/{surah}/{ayah} → the ayah inside its surah page. A temporary redirect for now:
// dedicated, indexable ayah pages are part of the SEO work (SPEC §9, Phase 12).
export default async function AyahPage({ params }: PageProps<'/[locale]/quran/[surah]/[ayah]'>) {
  const { surah: surahParam, ayah: ayahParam } = await params;
  const resolved = resolveSurahParam(surahParam);
  const ayah = Number(toAsciiDigits(decodeURIComponent(ayahParam)));
  const meta = await getMeta();
  if (!resolved || !Number.isInteger(ayah) || ayah < 1 || ayah > meta.surahs[resolved.surah - 1]!.ayahCount) notFound();
  redirect({ href: surahHref(resolved.surah, ayah), locale: await getLocale() });
}
