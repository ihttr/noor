import { getLocale, getTranslations } from 'next-intl/server';
import { placeholderMetadata } from '@/components/PlaceholderPage';
import { SurahIndex, type IndexHizb, type IndexStart } from '@/components/quran/SurahIndex';
import { getMeta } from '@/lib/quran/content';
import { surahHref } from '@/lib/quran/slugs';
import { PAGE_COUNT } from '@/lib/quran/structure';
import { surahDisplayName } from '@/lib/quran/view';

export const generateMetadata = () => placeholderMetadata('quran');

export default async function QuranIndexPage() {
  const [meta, locale, t] = [await getMeta(), await getLocale(), await getTranslations('Pages')];
  const name = (n: number) => surahDisplayName(meta, n, locale);

  const juz: IndexStart[] = meta.juz.map((j) => ({
    number: j.number,
    href: `/juz/${j.number}`,
    surahName: name(j.start.surah),
    ayah: j.start.ayah,
  }));
  const hizbs: IndexHizb[] = Array.from({ length: meta.counts.hizbs }, (_, i) => ({
    number: i + 1,
    quarters: meta.hizbQuarters
      .filter((q) => q.hizb === i + 1)
      .map((q) => ({
        number: q.number,
        quarterInHizb: q.quarter,
        href: surahHref(q.start.surah, q.start.ayah),
        surahName: name(q.start.surah),
        ayah: q.start.ayah,
      })),
  }));

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6">
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold md:text-3xl">{t('quran.title')}</h1>
        <p className="text-ink-muted">{t('quran.description')}</p>
      </header>
      <SurahIndex
        surahs={meta.surahs.map((s) => ({
          number: s.number,
          name: s.name,
          transliteration: s.transliteration,
          englishName: s.englishName,
          ayahCount: s.ayahCount,
          revelationType: s.revelationType,
          firstPage: s.firstPage,
          href: surahHref(s.number),
        }))}
        juz={juz}
        hizbs={hizbs}
        pageCount={PAGE_COUNT}
      />
    </div>
  );
}
