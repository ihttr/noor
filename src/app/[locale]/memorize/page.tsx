import { getLocale, getTranslations } from 'next-intl/server';
import { MemorizeView } from '@/components/memorize/MemorizeView';
import { placeholderMetadata } from '@/components/PlaceholderPage';
import { quranFontVariables } from '@/components/reader/fonts';
import { getMeta } from '@/lib/quran/content';
import { surahDisplayName } from '@/lib/quran/view';

// Private page: memorization progress lives on this device (and the account); never indexed.
export const generateMetadata = () => placeholderMetadata('memorize', { noindex: true });

export default async function MemorizePage() {
  const [t, locale, meta] = await Promise.all([getTranslations('Pages'), getLocale(), getMeta()]);
  const surahs = meta.surahs.map((s) => ({ name: surahDisplayName(meta, s.number, locale), ayahCount: s.ayahCount }));
  return (
    <article className={`quran-root mx-auto flex w-full max-w-3xl flex-col gap-6 ${quranFontVariables}`}>
      <header className="flex flex-col gap-2">
        <h1 className="text-2xl font-semibold md:text-3xl">{t('memorize.title')}</h1>
        <p className="text-ink-muted">{t('memorize.description')}</p>
      </header>
      <MemorizeView surahs={surahs} />
    </article>
  );
}
