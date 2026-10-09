import { getTranslations } from 'next-intl/server';
import { placeholderMetadata } from '@/components/PlaceholderPage';
import { PrayerView } from '@/components/prayer/PrayerView';

export const generateMetadata = () => placeholderMetadata('prayer');

export default async function PrayerPage() {
  const tp = await getTranslations('Pages');
  return (
    <article className="mx-auto flex w-full max-w-2xl flex-col gap-6">
      <header className="flex flex-col gap-2">
        <h1 className="text-2xl font-semibold md:text-3xl">{tp('prayer.title')}</h1>
        <p className="text-ink-muted">{tp('prayer.description')}</p>
      </header>
      <PrayerView />
    </article>
  );
}
