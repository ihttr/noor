import { getTranslations } from 'next-intl/server';
import { placeholderMetadata } from '@/components/PlaceholderPage';
import { QiblaView } from '@/components/qibla/QiblaView';

export const generateMetadata = () => placeholderMetadata('qibla');

export default async function QiblaPage() {
  const tp = await getTranslations('Pages');
  return (
    <article className="mx-auto flex w-full max-w-2xl flex-col gap-6">
      <header className="flex flex-col gap-2">
        <h1 className="text-2xl font-semibold md:text-3xl">{tp('qibla.title')}</h1>
        <p className="text-ink-muted">{tp('qibla.description')}</p>
      </header>
      <QiblaView />
    </article>
  );
}
