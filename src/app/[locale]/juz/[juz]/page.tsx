import type { Metadata } from 'next';
import { getLocale, getTranslations } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { QuranFlow } from '@/components/reader/QuranFlow';
import { SourceNote, StepNav } from '@/components/reader/ReaderFooter';
import { Reader } from '@/components/reader/Reader';
import { getJuz } from '@/lib/quran/content';
import { JUZ_COUNT } from '@/lib/quran/structure';
import { readerView } from '@/lib/quran/view';

// Reading mode over one juz (canonical /juz/{n}, SPEC §9).
export function generateStaticParams() {
  return Array.from({ length: JUZ_COUNT }, (_, i) => ({ juz: String(i + 1) }));
}

function parseJuz(param: string): number | null {
  const n = Number(param);
  return /^\d{1,2}$/.test(param) && n >= 1 && n <= JUZ_COUNT ? n : null;
}

export async function generateMetadata({ params }: PageProps<'/[locale]/juz/[juz]'>): Promise<Metadata> {
  const n = parseJuz((await params).juz);
  if (!n) return {};
  return { title: (await getTranslations('Quran'))('juz', { n }) };
}

export default async function JuzPage({ params }: PageProps<'/[locale]/juz/[juz]'>) {
  const n = parseJuz((await params).juz);
  if (!n) notFound();
  const locale = await getLocale();
  const juz = await getJuz(n);
  const view = await readerView(juz.ayahs, locale);
  const t = await getTranslations('Reader');
  const tq = await getTranslations('Quran');
  const href = (k: number) => `/juz/${k}`;

  return (
    <Reader
      mode="reading"
      title={tq('juz', { n })}
      initialInfo={view.initialInfo}
      surahNames={view.surahNames}
      surahSlugs={view.surahSlugs}
    >
      <article className="reader-column">
        <h1 className="mb-4 text-center text-2xl font-semibold">{tq('juz', { n })}</h1>
        <QuranFlow
          ayahs={view.ayahs}
          surahs={view.meta.surahs}
          bismillah={view.bismillah}
          quarterStarts={view.quarterStarts}
          surahHeading="h2"
          pageMarkers
        />
        <StepNav
          label={t('juzNav')}
          prev={n > 1 ? { href: href(n - 1), label: t('prevJuz'), detail: tq('juz', { n: n - 1 }) } : undefined}
          next={n < JUZ_COUNT ? { href: href(n + 1), label: t('nextJuz'), detail: tq('juz', { n: n + 1 }) } : undefined}
        />
        <SourceNote />
      </article>
    </Reader>
  );
}
