import type { Metadata } from 'next';
import { getLocale, getTranslations } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { QuranFlow } from '@/components/reader/QuranFlow';
import { SourceNote, StepNav } from '@/components/reader/ReaderFooter';
import { Reader } from '@/components/reader/Reader';
import { permanentRedirect } from '@/i18n/navigation';
import { JsonLd } from '@/components/JsonLd';
import { allSlugs, resolveSurahParam, slugOf, surahHref } from '@/lib/quran/slugs';
import { breadcrumbJsonLd, pageMetadata } from '@/lib/seo';
import { readerView, surahAyahs, surahDisplayName } from '@/lib/quran/view';
import { getMeta } from '@/lib/quran/content';

// The 114 surahs are prerendered with their Arabic text (SPEC §9). Numeric params (/quran/2)
// are rendered on demand and redirected (308) to the slug URL.
export function generateStaticParams() {
  return allSlugs().map((surah) => ({ surah }));
}

export async function generateMetadata({ params }: PageProps<'/[locale]/quran/[surah]'>): Promise<Metadata> {
  const resolved = resolveSurahParam((await params).surah);
  if (!resolved) return {};
  const [meta, locale, t] = [await getMeta(), await getLocale(), await getTranslations('Quran')];
  const s = meta.surahs[resolved.surah - 1]!;
  const name = surahDisplayName(meta, s.number, locale);
  return pageMetadata({
    title: t('surahTitle', { name }),
    description: t('surahDescription', { name, revelation: t(`revelation.${s.revelationType}`), count: s.ayahCount }),
    path: `/quran/${slugOf(s.number)}`,
    locale,
  });
}

export default async function SurahPage({ params }: PageProps<'/[locale]/quran/[surah]'>) {
  const resolved = resolveSurahParam((await params).surah);
  if (!resolved) notFound();
  const locale = await getLocale();
  if (!resolved.canonical) permanentRedirect({ href: surahHref(resolved.surah), locale });

  const n = resolved.surah;
  const view = await readerView(await surahAyahs(n), locale);
  const t = await getTranslations('Reader');
  const tq = await getTranslations('Quran');
  const name = (k: number) => surahDisplayName(view.meta, k, locale);

  return (
    <Reader
      mode="reading"
      title={tq('surahTitle', { name: name(n) })}
      initialInfo={view.initialInfo}
      surahNames={view.surahNames}
      surahSlugs={view.surahSlugs}
    >
      <article className="reader-column">
        <JsonLd
          data={breadcrumbJsonLd(
            [
              { name: (await getTranslations('Nav'))('home'), path: '/' },
              { name: (await getTranslations('Nav'))('quran'), path: '/quran' },
              { name: tq('surahTitle', { name: name(n) }), path: `/quran/${slugOf(n)}` },
            ],
            locale
          )}
        />
        <QuranFlow
          ayahs={view.ayahs}
          surahs={view.meta.surahs}
          bismillah={view.bismillah}
          quarterStarts={view.quarterStarts}
          surahHeading="h1"
          pageMarkers
          pageAyahCounts={view.pageAyahCounts}
        />
        <StepNav
          label={t('surahNav')}
          prev={n > 1 ? { href: surahHref(n - 1), label: t('prevSurah'), detail: name(n - 1) } : undefined}
          next={n < 114 ? { href: surahHref(n + 1), label: t('nextSurah'), detail: name(n + 1) } : undefined}
        />
        <SourceNote />
      </article>
    </Reader>
  );
}
