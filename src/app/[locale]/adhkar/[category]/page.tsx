import { Bookmark, BookmarkCheck, Minus, NotebookPen, RotateCcw } from 'lucide-react';
import type { Metadata } from 'next';
import { pageMetadata } from '@/lib/seo';
import { getLocale, getTranslations } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { AdhkarSession, type DhikrView } from '@/components/adhkar/AdhkarSession';
import { quranFontVariables } from '@/components/reader/fonts';
import { Link } from '@/i18n/navigation';
import { getAdhkarCategory, getAdhkarIndex, isAdhkarCategory } from '@/lib/adhkar/content';
import { ADHKAR_CATEGORIES } from '@/lib/adhkar/types';
import { getMeta, getSurah } from '@/lib/quran/content';
import { formatNumber } from '@/lib/reader/ayah-share';
import { surahDisplayName } from '@/lib/quran/view';

// The adhkar category pages are prerendered (SPEC §9), with the Arabic text in the HTML.
export function generateStaticParams() {
  return ADHKAR_CATEGORIES.map((category) => ({ category }));
}

export async function generateMetadata({ params }: PageProps<'/[locale]/adhkar/[category]'>): Promise<Metadata> {
  const { category } = await params;
  if (!isAdhkarCategory(category)) return {};
  const t = await getTranslations('Adhkar');
  return pageMetadata({
    title: t(`categories.${category}`),
    description: t('categoryDescription', { name: t(`categories.${category}`) }),
    path: `/adhkar/${category}`,
    locale: await getLocale(),
    // Categories without approved content yet are thin pages: not indexed (SPEC §9).
    noindex: !(await getAdhkarCategory(category)),
  });
}

export default async function AdhkarCategoryPage({ params }: PageProps<'/[locale]/adhkar/[category]'>) {
  const { category } = await params;
  if (!isAdhkarCategory(category)) notFound();
  const [t, locale, file, meta, index] = await Promise.all([
    getTranslations('Adhkar'),
    getLocale(),
    getAdhkarCategory(category),
    getMeta(),
    getAdhkarIndex(),
  ]);
  const ar = locale === 'ar';
  const n = (x: number) => formatNumber(x, ar);

  const items: DhikrView[] = file
    ? await Promise.all(
        file.items.map(async (d) => ({
          id: d.id,
          order: d.order,
          count: d.count,
          reference: ar ? d.reference.ar : d.reference.en,
          translation: ar ? null : d.translation || null,
          parts: await Promise.all(
            d.parts.map(async (p) => {
              if (p.kind === 'text') return p;
              const surah = await getSurah(p.surah);
              const name = surahDisplayName(meta, p.surah, locale);
              const range = p.from === p.to ? n(p.from) : `${n(p.from)}–${n(p.to)}`;
              return {
                kind: 'quran' as const,
                ayahs: surah.ayahs.filter((a) => a.number >= p.from && a.number <= p.to).map((a) => ({ surah: p.surah, ayah: a.number, text: a.text })),
                label: ar ? `[${name}: ${range}]` : `[${name} ${p.surah}:${range}]`,
              };
            })
          ),
        }))
      )
    : [];
  const icon = 'size-5 shrink-0';

  return (
    <article className={`quran-root mx-auto flex w-full max-w-3xl flex-col gap-5 ${quranFontVariables}`}>
      <header className="flex flex-col gap-2">
        <Link href="/adhkar" className="text-sm text-accent underline-offset-4 hover:underline">
          {t('allCategories')}
        </Link>
        <h1 className="text-2xl font-semibold md:text-3xl">{t(`categories.${category}`)}</h1>
        {file && <p className="text-ink-muted">{t('count', { count: file.items.length })}</p>}
      </header>

      {file ? (
        <AdhkarSession
          category={category}
          items={items}
          icons={{
            minus: <Minus aria-hidden="true" className={icon} />,
            reset: <RotateCcw aria-hidden="true" className={icon} strokeWidth={1.75} />,
            save: <Bookmark aria-hidden="true" className={icon} strokeWidth={1.75} />,
            saved: <BookmarkCheck aria-hidden="true" className={`${icon} text-accent`} strokeWidth={2} />,
            note: <NotebookPen aria-hidden="true" className={icon} strokeWidth={1.75} />,
          }}
        />
      ) : (
        <p className="rounded-2xl border border-dashed border-line bg-surface p-5 text-ink-muted">{t('noSource')}</p>
      )}

      <p className="text-center text-xs text-ink-muted">
        {t('sourceNote', { name: index.source.attribution })}{' '}
        <a href={index.source.url} className="underline underline-offset-2" rel="noopener">
          GitHub
        </a>
        {' · '}
        {t('quranNote')}
      </p>
    </article>
  );
}
