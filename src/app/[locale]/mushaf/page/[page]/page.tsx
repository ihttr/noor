import type { Metadata } from 'next';
import { pageMetadata } from '@/lib/seo';
import { getLocale, getTranslations } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { QuranFlow } from '@/components/reader/QuranFlow';
import { SourceNote, StepNav } from '@/components/reader/ReaderFooter';
import { Reader } from '@/components/reader/Reader';
import { getMeta, getPage } from '@/lib/quran/content';
import { PAGE_COUNT } from '@/lib/quran/structure';
import { readerView, surahDisplayName } from '@/lib/quran/view';

// Mushaf mode: one Madani page at a time (SPEC §7.3). Page boundaries follow the Madani Mushaf;
// the line layout is approximate (no per-page QCF fonts in v1).
export function generateStaticParams() {
  return Array.from({ length: PAGE_COUNT }, (_, i) => ({ page: String(i + 1) }));
}

function parsePage(param: string): number | null {
  const n = Number(param);
  return /^\d{1,3}$/.test(param) && n >= 1 && n <= PAGE_COUNT ? n : null;
}

export async function generateMetadata({ params }: PageProps<'/[locale]/mushaf/page/[page]'>): Promise<Metadata> {
  const n = parsePage((await params).page);
  if (!n) return {};
  const t = await getTranslations('Quran');
  const locale = await getLocale();
  const [meta, page] = await Promise.all([getMeta(), getPage(n)]);
  const surahs = [...new Set(page.ayahs.map((a) => a.surah))].map((s) => surahDisplayName(meta, s, locale)).join('، ');
  return pageMetadata({ title: t('page', { n }), description: t('pageDescription', { n, surahs }), path: `/mushaf/page/${n}`, locale });
}

export default async function MushafPage({ params }: PageProps<'/[locale]/mushaf/page/[page]'>) {
  const n = parsePage((await params).page);
  if (!n) notFound();
  const locale = await getLocale();
  const page = await getPage(n);
  const view = await readerView(page.ayahs, locale);
  const t = await getTranslations('Reader');
  const tq = await getTranslations('Quran');
  const first = page.ayahs[0]!;
  const surahsOnPage = [...new Set(page.ayahs.map((a) => a.surah))].map((s) => view.surahNames[s]).join(' · ');
  const href = (k: number) => `/mushaf/page/${k}`;

  return (
    <Reader
      mode="mushaf"
      title={tq('page', { n })}
      initialInfo={view.initialInfo}
      surahNames={view.surahNames}
      surahSlugs={view.surahSlugs}
      pageTurn={{ prev: n > 1 ? href(n - 1) : undefined, next: n < PAGE_COUNT ? href(n + 1) : undefined }}
    >
      <article className="reader-column">
        <h1 className="sr-only">{tq('page', { n })}</h1>
        <div className="mushaf-page">
          <div className="mushaf-head" aria-hidden="true">
            <span>{surahsOnPage}</span>
            <span>{tq('juz', { n: first.juz })}</span>
          </div>
          <QuranFlow
            ayahs={view.ayahs}
            surahs={view.meta.surahs}
            bismillah={view.bismillah}
            quarterStarts={view.quarterStarts}
            surahHeading="h2"
            pageMarkers={false}
            pageAyahCounts={view.pageAyahCounts}
          />
          <p className="mushaf-foot">{t('pageOf', { n, total: PAGE_COUNT })}</p>
        </div>
        <StepNav
          bookOrder
          label={t('pageNav')}
          prev={n > 1 ? { href: href(n - 1), label: t('prevPage'), detail: tq('page', { n: n - 1 }) } : undefined}
          next={n < PAGE_COUNT ? { href: href(n + 1), label: t('nextPage'), detail: tq('page', { n: n + 1 }) } : undefined}
        />
        <p className="mt-3 text-center text-xs text-ink-muted">{t('swipeHint')}</p>
        <SourceNote mushaf />
      </article>
    </Reader>
  );
}
