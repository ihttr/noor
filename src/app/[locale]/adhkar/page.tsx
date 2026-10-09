import { getTranslations } from 'next-intl/server';
import { AdhkarToday } from '@/components/adhkar/AdhkarToday';
import { placeholderMetadata } from '@/components/PlaceholderPage';
import { adhkarTargets } from '@/lib/adhkar/targets';

export const generateMetadata = () => placeholderMetadata('adhkar');

/** Adhkar categories (SPEC §7.14) with today's progress. */
export default async function AdhkarPage() {
  const [t, tp, categories] = await Promise.all([getTranslations('Adhkar'), getTranslations('Pages'), adhkarTargets()]);
  return (
    <article className="mx-auto flex w-full max-w-3xl flex-col gap-6">
      <header className="flex flex-col gap-2">
        <h1 className="text-2xl font-semibold md:text-3xl">{tp('adhkar.title')}</h1>
        <p className="text-ink-muted">{tp('adhkar.description')}</p>
      </header>
      <AdhkarToday categories={categories} />
      <p className="text-sm text-ink-muted">{t('coverage')}</p>
    </article>
  );
}
