import type { Metadata } from 'next';
import { getLocale, getTranslations } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { JsonLd } from '@/components/JsonLd';
import { quranFontVariables } from '@/components/reader/fonts';
import { SourceNote, StepNav } from '@/components/reader/ReaderFooter';
import { Link, permanentRedirect } from '@/i18n/navigation';
import { getAyah, getMeta } from '@/lib/quran/content';
import { toAsciiDigits } from '@/lib/quran/normalize';
import { resolveSurahParam, slugOf } from '@/lib/quran/slugs';
import { surahDisplayName } from '@/lib/quran/view';
import { breadcrumbJsonLd, pageMetadata } from '@/lib/seo';
import { getTafsirRegistry, getTafsirSurah } from '@/lib/tafsir/content';

// One ayah (SPEC §9): /quran/{slug}/{ayah}, rendered on demand and cached (no params at build
// time). The ayah text is placed verbatim in [data-ayah-text]; the tafsir is shown exactly as
// imported, with its name, author and source (SPEC §2.8). /quran/2/255 redirects (308) here.
export const dynamicParams = true;
export const revalidate = false;
export function generateStaticParams() {
  return [];
}

async function resolve(params: { surah: string; ayah: string }) {
  const resolved = resolveSurahParam(params.surah);
  const ayah = Number(toAsciiDigits(decodeURIComponent(params.ayah)));
  const meta = await getMeta();
  if (!resolved || !Number.isInteger(ayah) || ayah < 1 || ayah > meta.surahs[resolved.surah - 1]!.ayahCount) return null;
  return { ...resolved, ayah, meta, canonicalAyah: String(ayah) === params.ayah };
}

export async function generateMetadata({ params }: PageProps<'/[locale]/quran/[surah]/[ayah]'>): Promise<Metadata> {
  const r = await resolve(await params);
  if (!r) return {};
  const [locale, t] = [await getLocale(), await getTranslations('Quran')];
  const surah = surahDisplayName(r.meta, r.surah, locale);
  return pageMetadata({
    title: t('ayahTitle', { surah, number: r.surah, ayah: r.ayah }),
    description: t('ayahDescription', { surah, ayah: r.ayah }),
    path: `/quran/${slugOf(r.surah)}/${r.ayah}`,
    locale,
  });
}

export default async function AyahPage({ params }: PageProps<'/[locale]/quran/[surah]/[ayah]'>) {
  const r = await resolve(await params);
  if (!r) notFound();
  const locale = await getLocale();
  if (!r.canonical || !r.canonicalAyah) permanentRedirect({ href: `/quran/${slugOf(r.surah)}/${r.ayah}`, locale });

  const [t, tr, tq, tt, tn, ayah, registry] = await Promise.all([
    getTranslations('Ayah'),
    getTranslations('Reader'),
    getTranslations('Quran'),
    getTranslations('Tafsir'),
    getTranslations('Nav'),
    getAyah(r.surah, r.ayah),
    getTafsirRegistry(),
  ]);
  if (!ayah) notFound();
  const s = r.meta.surahs[r.surah - 1]!;
  const surahName = surahDisplayName(r.meta, r.surah, locale);
  const slug = slugOf(r.surah);
  const tafsirId = registry.tafsirs[0]?.id;
  const tafsir = tafsirId ? await getTafsirSurah(tafsirId, r.surah) : null;
  const entry = tafsir?.entries.find((e) => e.ayah === r.ayah);
  const lang = locale === 'ar' ? 'ar' : 'en';
  const step = (n: number) => ({ href: `/quran/${slug}/${n}`, label: n < r.ayah ? t('previous') : t('next'), detail: tq('ayahShort', { n }) });
  const crumbs = [
    { name: tn('home'), path: '/' },
    { name: tn('quran'), path: '/quran' },
    { name: tq('surahTitle', { name: surahName }), path: `/quran/${slug}` },
    { name: tq('ayahShort', { n: r.ayah }), path: `/quran/${slug}/${r.ayah}` },
  ];

  return (
    <article className={`quran-root mx-auto flex w-full max-w-3xl flex-col gap-6 ${quranFontVariables}`}>
      <JsonLd data={breadcrumbJsonLd(crumbs, locale)} />
      <nav aria-label={t('breadcrumb')}>
        <ol className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-ink-muted">
          {crumbs.slice(0, -1).map((c) => (
            <li key={c.path} className="flex items-center gap-2">
              <Link href={c.path} className="underline underline-offset-2 hover:text-accent">
                {c.name}
              </Link>
              <span aria-hidden="true">/</span>
            </li>
          ))}
          <li aria-current="page">{crumbs.at(-1)!.name}</li>
        </ol>
      </nav>
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold md:text-3xl">{tq('ayahTitle', { surah: surahName, number: r.surah, ayah: r.ayah })}</h1>
        <p className="text-sm text-ink-muted">
          {tq(`revelation.${s.revelationType}`)} · {tq('page', { n: ayah.page })} · {tq('juz', { n: ayah.juz })}
        </p>
      </header>

      <div className="quran-flow rounded-2xl border border-line bg-surface p-5" lang="ar" dir="rtl">
        <p className="quran-text">
          <span className="ayah" id={`ayah-${r.surah}-${r.ayah}`}>
            <span data-ayah-text={`${r.surah}:${r.ayah}`}>{ayah.text}</span>{' '}
            <span className="ayah-number" role="img" aria-label={tr('ayahLabel', { n: r.ayah })} style={{ counterSet: `ayah ${r.ayah}` }} />
          </span>
        </p>
      </div>

      <div className="flex flex-wrap gap-3">
        <Link href={`/quran/${slug}#ayah-${r.surah}-${r.ayah}`} className="primary-button inline-flex items-center">
          {t('readInSurah')}
        </Link>
        <Link href={`/mushaf/page/${ayah.page}#ayah-${r.surah}-${r.ayah}`} className="secondary-button inline-flex items-center">
          {t('openMushaf', { n: ayah.page })}
        </Link>
      </div>

      {tafsir && entry && (
        <section aria-labelledby="tafsir-title" className="flex flex-col gap-3 rounded-2xl border border-line bg-surface p-5">
          <h2 id="tafsir-title" className="text-lg font-semibold">
            {tafsir.source.name[lang]}
          </h2>
          <p lang="ar" dir="rtl" className="tafsir-text text-lg leading-loose">
            {entry.text}
          </p>
          {entry.footnotes && (
            <p lang="ar" dir="rtl" className="text-sm leading-relaxed text-ink-muted">
              {entry.footnotes}
            </p>
          )}
          <p className="text-xs text-ink-muted">
            {tt('attribution', { name: tafsir.source.name[lang], author: tafsir.source.author[lang] })} ·{' '}
            <a href={tafsir.source.distribution.url} className="underline underline-offset-2" rel="noopener">
              {tafsir.source.distribution.name}
            </a>{' '}
            · {tafsir.source.version ? tt('version', { version: tafsir.source.version }) : tt('downloaded', { date: new Date(`${tafsir.source.downloadedAt}T12:00:00Z`) })}
          </p>
        </section>
      )}

      <StepNav
        label={t('ayahNav')}
        prev={r.ayah > 1 ? step(r.ayah - 1) : undefined}
        next={r.ayah < s.ayahCount ? step(r.ayah + 1) : undefined}
      />
      <SourceNote />
    </article>
  );
}
