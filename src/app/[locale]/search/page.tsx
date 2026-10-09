import type { Metadata } from 'next';
import { pageMetadata } from '@/lib/seo';
import { getLocale, getTranslations } from 'next-intl/server';
import { Suspense } from 'react';
import { quranFontVariables } from '@/components/reader/fonts';
import { SearchView } from '@/components/search/SearchView';
import { getMeta } from '@/lib/quran/content';
import { slugOf } from '@/lib/quran/slugs';
import { surahDisplayName } from '@/lib/quran/view';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('Search');
  // Result pages are thin by nature: not indexed, links followed (SPEC §9).
  return pageMetadata({ title: t('title'), description: t('description'), path: '/search', locale: await getLocale(), noindex: 'follow' });
}

export default async function SearchPage() {
  const [t, locale, meta] = await Promise.all([getTranslations('Search'), getLocale(), getMeta()]);
  const surahs = meta.surahs.map((s) => ({ name: surahDisplayName(meta, s.number, locale), slug: slugOf(s.number) }));
  return (
    <article className={`quran-root mx-auto flex w-full max-w-3xl flex-col gap-6 ${quranFontVariables}`}>
      <header className="flex flex-col gap-2">
        <h1 className="text-2xl font-semibold md:text-3xl">{t('title')}</h1>
        <p className="text-ink-muted">{t('description')}</p>
      </header>
      <Suspense fallback={<div className="h-64 animate-pulse rounded-2xl border border-line bg-surface" />}>
        <SearchView surahs={surahs} />
      </Suspense>
    </article>
  );
}
