import { getLocale, getTranslations } from 'next-intl/server';
import { Fragment, type ReactNode } from 'react';
import type { AyahWithRef, SurahMeta } from '@/lib/quran/types';

/*
 * Server-rendered Quran text (SPEC §7.3). Every ayah string is placed into the DOM exactly as it
 * is stored in content/ — no splitting, trimming or replacement — inside [data-ayah-text], which
 * the DOM integrity test compares with the source. Ayah numbers, quarter and sajdah marks are
 * separate elements outside the text (numbers come from a CSS counter).
 *
 * Ayahs are grouped by Madani page into <section>s with `content-visibility: auto`, so long
 * surahs stay fully in the DOM (find-in-page, SEO, screen readers) while the browser skips work
 * for off-screen pages (D-014).
 */

interface Props {
  ayahs: AyahWithRef[];
  surahs: readonly SurahMeta[];
  /** Header Basmala per surah number, verbatim from content (null for 1 and 9). */
  bismillah: Readonly<Record<number, string | null>>;
  /** Hizb quarter number keyed by the ayah that starts it. */
  quarterStarts: ReadonlyMap<string, number>;
  /** Heading level used for surah headers inside the flow. */
  surahHeading: 'h1' | 'h2';
  /** Show page dividers (reading mode); the Mushaf view frames a single page itself. */
  pageMarkers: boolean;
}

function groupByPage(ayahs: AyahWithRef[]): AyahWithRef[][] {
  const pages: AyahWithRef[][] = [];
  for (const a of ayahs) {
    const last = pages.at(-1);
    if (last && last[0]!.page === a.page) last.push(a);
    else pages.push([a]);
  }
  return pages;
}

/** Surah header frame: the Arabic surah name (Tanzil metadata) and, in the UI language, its details. */
export async function SurahHeader({ surah, as: Heading }: { surah: SurahMeta; as: 'h1' | 'h2' }) {
  const locale = await getLocale();
  const t = await getTranslations('Quran');
  const tAr = await getTranslations({ locale: 'ar', namespace: 'Quran' });
  const details = [
    ...(locale === 'ar' ? [] : [`${surah.transliteration} (${surah.englishName})`]),
    t(`revelation.${surah.revelationType}`),
    t('ayahCount', { count: surah.ayahCount }),
  ];
  return (
    <header className="surah-header" data-surah-header={surah.number} lang="ar" dir="rtl">
      <Heading className="surah-header-title">{tAr('surahTitle', { name: surah.name })}</Heading>
      <p className="surah-header-meta" lang={locale} dir={locale === 'ar' ? 'rtl' : 'ltr'}>
        {details.join(' · ')}
      </p>
    </header>
  );
}

export async function QuranFlow({ ayahs, surahs, bismillah, quarterStarts, surahHeading, pageMarkers }: Props) {
  const locale = await getLocale();
  const t = await getTranslations('Reader');
  const tq = await getTranslations('Quran');
  const pages = groupByPage(ayahs);

  const renderAyah = (a: AyahWithRef, tabbable: boolean) => {
    const quarter = quarterStarts.get(a.key);
    return (
      <Fragment key={a.key}>
        <span
          className="ayah"
          id={`ayah-${a.surah}-${a.number}`}
          data-ayah={a.key}
          data-page={a.page}
          tabIndex={tabbable ? 0 : -1}
        >
          {quarter !== undefined && a.key !== '1:1' && (
            <span className="quarter-mark" role="img" lang={locale} aria-label={t('quarterMark', { n: quarter })}>
              {'۞'}
            </span>
          )}
          <span className="ayah-text" data-ayah-text={a.key}>
            {a.text}
          </span>
          <span
            className="ayah-end"
            role="img"
            lang={locale}
            aria-label={t('ayahLabel', { n: a.number })}
            style={{ counterSet: `ayah ${a.number}` }}
          />
          {a.sajdah && (
            <span className="sajdah-mark" lang={locale} title={t('sajdahLabel')}>
              {t('sajdah')}
            </span>
          )}
        </span>{' '}
      </Fragment>
    );
  };

  const firstKey = ayahs[0]?.key;

  return (
    <div className="quran-flow" lang="ar" dir="rtl">
      {pages.map((pageAyahs, index) => {
        const head = pageAyahs[0]!;
        // Split the page into runs that start at a surah's first ayah (header + Basmala first).
        const runs: { surah?: SurahMeta; ayahs: AyahWithRef[] }[] = [];
        for (const a of pageAyahs) {
          if (a.number === 1 || runs.length === 0) runs.push({ surah: a.number === 1 ? surahs[a.surah - 1] : undefined, ayahs: [a] });
          else runs.at(-1)!.ayahs.push(a);
        }
        const showJuz = pageMarkers && (index === 0 || pages[index - 1]![0]!.juz !== head.juz);

        return (
          <section
            key={head.page}
            className="quran-page"
            data-page={head.page}
            data-juz={head.juz}
            data-hizb={head.hizb}
            data-quarter={head.hizbQuarter}
            data-surah={head.surah}
            aria-label={tq('page', { n: head.page })}
          >
            {pageMarkers && (
              <div className="page-marker" aria-hidden="true" lang={locale}>
                <span>
                  {tq('page', { n: head.page })}
                  {showJuz && ` · ${tq('juz', { n: head.juz })}`}
                </span>
              </div>
            )}
            {runs.map((run) => {
              const header: ReactNode = run.surah ? (
                <>
                  <SurahHeader surah={run.surah} as={surahHeading} />
                  {bismillah[run.surah.number] && (
                    <p className="basmala">
                      <span data-basmala={run.surah.number}>{bismillah[run.surah.number]}</span>
                    </p>
                  )}
                </>
              ) : null;
              return (
                <Fragment key={run.ayahs[0]!.key}>
                  {header}
                  <p className="quran-text">
                    {run.ayahs.map((a) => renderAyah(a, a.key === firstKey))}
                  </p>
                </Fragment>
              );
            })}
          </section>
        );
      })}
    </div>
  );
}
