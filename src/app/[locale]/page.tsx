import { getTranslations } from 'next-intl/server';
import { PlaceholderPage, placeholderMetadata } from '@/components/PlaceholderPage';

export const generateMetadata = () => placeholderMetadata('home');

export default async function HomePage() {
  const t = await getTranslations('Shell');
  const tp = await getTranslations('Placeholder');

  return (
    <PlaceholderPage pageKey="home">
      <section className="rounded-2xl border border-line bg-surface p-5">
        <p className="font-semibold">{t('tagline')}</p>
        <p className="mt-2 text-sm text-ink-muted">{tp('shellNotice', { phase: 1 })}</p>
      </section>
    </PlaceholderPage>
  );
}
