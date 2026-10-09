import { getTranslations } from 'next-intl/server';
import { placeholderMetadata } from '@/components/PlaceholderPage';

export const generateMetadata = () => placeholderMetadata('privacy');

const SECTIONS = ['device', 'account', 'location', 'thirdParties', 'none', 'control'] as const;

/** Privacy in plain language (SPEC §12). */
export default async function PrivacyPage() {
  const [t, tp] = await Promise.all([getTranslations('Privacy'), getTranslations('Pages')]);
  return (
    <article className="mx-auto flex w-full max-w-3xl flex-col gap-5">
      <header className="flex flex-col gap-2">
        <h1 className="text-2xl font-semibold md:text-3xl">{tp('privacy.title')}</h1>
        <p className="text-ink-muted">{t('intro')}</p>
      </header>
      {SECTIONS.map((key) => (
        <section key={key} aria-labelledby={`privacy-${key}`} className="flex flex-col gap-2 rounded-2xl border border-line bg-surface p-5">
          <h2 id={`privacy-${key}`} className="text-lg font-semibold">
            {t(`sections.${key}.title`)}
          </h2>
          <p className="leading-relaxed">{t(`sections.${key}.body`)}</p>
        </section>
      ))}
    </article>
  );
}
