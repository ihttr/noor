import { getTranslations } from 'next-intl/server';
import { placeholderMetadata } from '@/components/PlaceholderPage';
import { StatsView } from '@/components/stats/StatsView';
import { getMeta } from '@/lib/quran/content';
import { ayahIndex, divisionAt } from '@/lib/quran/structure';

// Private page: statistics are computed on the device from its own data; never indexed.
export const generateMetadata = () => placeholderMetadata('stats', { noindex: true });

export default async function StatsPage() {
  const [t, meta] = await Promise.all([getTranslations('Pages'), getMeta()]);
  const pageOf = (surah: number, ayah: number) => divisionAt(meta, meta.pages, ayahIndex(meta, { surah, ayah }));
  // First and last Mushaf page of every surah ("surahs completed", D-067).
  const surahPages = meta.surahs.map((s) => [pageOf(s.number, 1), pageOf(s.number, s.ayahCount)] as const);
  return (
    <article className="mx-auto flex w-full max-w-3xl flex-col gap-6">
      <header className="flex flex-col gap-2">
        <h1 className="text-2xl font-semibold md:text-3xl">{t('stats.title')}</h1>
        <p className="text-ink-muted">{t('stats.description')}</p>
      </header>
      <StatsView surahPages={surahPages} />
    </article>
  );
}
