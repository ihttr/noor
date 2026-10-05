import { getTranslations } from 'next-intl/server';
import { placeholderMetadata } from '@/components/PlaceholderPage';
import { getMeta } from '@/lib/quran/content';

export const generateMetadata = () => placeholderMetadata('about');

/** About & sources (SPEC §3): where every piece of content comes from, and its license. */
export default async function AboutPage() {
  const [meta, t, tp] = [await getMeta(), await getTranslations('About'), await getTranslations('Pages')];
  const section = 'flex flex-col gap-2 rounded-2xl border border-line bg-surface p-5';

  return (
    <article className="mx-auto flex w-full max-w-3xl flex-col gap-5">
      <header className="flex flex-col gap-2">
        <h1 className="text-2xl font-semibold md:text-3xl">{tp('about.title')}</h1>
        <p className="text-ink-muted">{t('intro')}</p>
      </header>

      <section className={section} aria-labelledby="about-text">
        <h2 id="about-text" className="text-lg font-semibold">
          {t('quranText')}
        </h2>
        <p>{t('quranTextBody', { version: meta.text.version })}</p>
        <p>
          <a href={meta.text.url} className="text-accent underline underline-offset-2" rel="noopener">
            tanzil.net
          </a>
        </p>
      </section>

      <section className={section} aria-labelledby="about-structure">
        <h2 id="about-structure" className="text-lg font-semibold">
          {t('metadata')}
        </h2>
        <p>{t('metadataBody')}</p>
      </section>

      <section className={section} aria-labelledby="about-mushaf">
        <h2 id="about-mushaf" className="text-lg font-semibold">
          {t('mushaf')}
        </h2>
        <p>{t('mushafBody')}</p>
      </section>

      <section className={section} aria-labelledby="about-fonts">
        <h2 id="about-fonts" className="text-lg font-semibold">
          {t('fonts')}
        </h2>
        <p>{t('fontsBody')}</p>
      </section>

      <p className="text-sm text-ink-muted">{t('notYet')}</p>

      <section className={section} aria-labelledby="about-notice">
        <h2 id="about-notice" className="text-lg font-semibold">
          {t('notice')}
        </h2>
        {/* Reproduced verbatim, as Tanzil's terms require. */}
        <pre dir="ltr" lang="en" className="whitespace-pre-wrap text-start text-xs leading-relaxed text-ink-muted [overflow-wrap:anywhere]">
          {meta.text.notice}
        </pre>
      </section>
    </article>
  );
}
