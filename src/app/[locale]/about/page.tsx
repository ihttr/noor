import { getLocale, getTranslations } from 'next-intl/server';
import { placeholderMetadata } from '@/components/PlaceholderPage';
import { Link } from '@/i18n/navigation';
import { getMeta } from '@/lib/quran/content';
import { getTafsirRegistry } from '@/lib/tafsir/content';
import { getAdhkarIndex } from '@/lib/adhkar/content';

export const generateMetadata = () => placeholderMetadata('about');

/** About & sources (SPEC §3): where every piece of content comes from, and its license. */
export default async function AboutPage() {
  const [meta, t, tp, locale, { tafsirs }] = await Promise.all([
    getMeta(),
    getTranslations('About'),
    getTranslations('Pages'),
    getLocale(),
    getTafsirRegistry(),
  ]);
  const adhkar = await getAdhkarIndex();
  const lang = locale === 'ar' ? 'ar' : 'en';
  const section = 'flex flex-col gap-2 rounded-2xl border border-line bg-surface p-5';

  return (
    <article className="mx-auto flex w-full max-w-3xl flex-col gap-5">
      <header className="flex flex-col gap-2">
        <h1 className="text-2xl font-semibold md:text-3xl">{tp('about.title')}</h1>
        <p className="text-ink-muted">{t('intro')}</p>
        <Link href="/privacy" className="self-start text-sm text-accent underline underline-offset-2">
          {t('privacyLink')}
        </Link>
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

      {tafsirs.map((x) => (
        <section key={x.id} className={section} aria-labelledby={`about-tafsir-${x.id}`}>
          <h2 id={`about-tafsir-${x.id}`} className="text-lg font-semibold">
            {t('tafsir')}: {x.source.name[lang]}
          </h2>
          <p>
            {t('tafsirBody', {
              name: x.source.name[lang],
              author: x.source.author[lang],
              distribution: x.source.distribution.name,
              license: x.source.license.name,
            })}
          </p>
          <p className="text-sm text-ink-muted">
            {x.source.version ? t('tafsirVersion', { version: x.source.version }) : t('tafsirNoVersion', { date: new Date(`${x.source.downloadedAt}T12:00:00Z`) })}
          </p>
          <p>
            <a href={x.source.distribution.url} className="text-accent underline underline-offset-2" rel="noopener">
              {x.source.distribution.name}
            </a>
          </p>
        </section>
      ))}

      <section className={section} aria-labelledby="about-audio">
        <h2 id="about-audio" className="text-lg font-semibold">
          {t('audio')}
        </h2>
        <p>{t('audioBody', { name: 'Islamic Network (alquran.cloud)' })}</p>
        <p>
          <a href="https://alquran.cloud/terms-and-conditions" className="text-accent underline underline-offset-2" rel="noopener">
            alquran.cloud/terms-and-conditions
          </a>
        </p>
      </section>

      <section className={section} aria-labelledby="about-adhkar">
        <h2 id="about-adhkar" className="text-lg font-semibold">
          {t('adhkar')}
        </h2>
        <p>{t('adhkarBody')}</p>
        <p>
          <a href={adhkar.source.url} className="text-accent underline underline-offset-2" rel="noopener">
            {adhkar.source.attribution}
          </a>
        </p>
      </section>

      <section className={section} aria-labelledby="about-prayer">
        <h2 id="about-prayer" className="text-lg font-semibold">
          {t('prayer')}
        </h2>
        <p>{t('prayerBody')}</p>
        <p>{t('cities')}</p>
        <p>
          <a href="https://www.geonames.org" className="text-accent underline underline-offset-2" rel="noopener">
            City data © GeoNames (geonames.org), CC BY 4.0
          </a>
        </p>
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
