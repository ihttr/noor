import { ArrowDown, ArrowUp, FolderOpen, Trash2, X } from 'lucide-react';
import { getLocale, getTranslations } from 'next-intl/server';
import { placeholderMetadata } from '@/components/PlaceholderPage';
import { quranFontVariables } from '@/components/reader/fonts';
import { SavedView } from '@/components/saved/SavedView';
import { getMeta } from '@/lib/quran/content';
import { slugOf } from '@/lib/quran/slugs';
import { surahDisplayName } from '@/lib/quran/view';

// Private page: saved items and notes live on this device (SPEC §7.6); never indexed (SPEC §9).
export const generateMetadata = () => placeholderMetadata('saved', { noindex: true });

export default async function SavedPage() {
  const [t, locale, meta] = await Promise.all([getTranslations('Pages'), getLocale(), getMeta()]);
  const surahs = meta.surahs.map((s) => ({
    name: surahDisplayName(meta, s.number, locale),
    search: `${s.name} ${s.transliteration} ${s.englishName}`,
    slug: slugOf(s.number),
  }));
  const pageSurahs = meta.pages.map((p) => p.start.surah);
  const icon = 'size-5 shrink-0';

  return (
    <article className={`quran-root mx-auto flex w-full max-w-3xl flex-col gap-6 ${quranFontVariables}`}>
      <header className="flex flex-col gap-2">
        <h1 className="text-2xl font-semibold md:text-3xl">{t('saved.title')}</h1>
        <p className="text-ink-muted">{t('saved.description')}</p>
      </header>
      <SavedView
        surahs={surahs}
        pageSurahs={pageSurahs}
        icons={{
          collections: <FolderOpen aria-hidden="true" className={icon} strokeWidth={1.75} />,
          close: <X aria-hidden="true" className={icon} />,
          up: <ArrowUp aria-hidden="true" className={icon} strokeWidth={1.75} />,
          down: <ArrowDown aria-hidden="true" className={icon} strokeWidth={1.75} />,
          remove: <Trash2 aria-hidden="true" className={icon} strokeWidth={1.75} />,
        }}
      />
    </article>
  );
}
