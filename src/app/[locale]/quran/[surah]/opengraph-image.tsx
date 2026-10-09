import { ImageResponse } from 'next/og';
import { getTranslations } from 'next-intl/server';
import { routing } from '@/i18n/routing';
import { BrandMark, COLORS, Line, OG_SIZE, ogFonts } from '@/lib/og/og';
import { getMeta } from '@/lib/quran/content';
import { allSlugs, resolveSurahParam } from '@/lib/quran/slugs';

type Locale = (typeof routing.locales)[number];
const asLocale = (v: string): Locale => ((routing.locales as readonly string[]).includes(v) ? (v as Locale) : routing.defaultLocale);

export const size = OG_SIZE;
export const contentType = 'image/png';
export const alt = 'Surah';

export function generateStaticParams() {
  return allSlugs().map((surah) => ({ surah }));
}

/** Open Graph image of a surah (SPEC §9): its Arabic name, transliteration and meaning. */
export default async function Image({ params }: { params: Promise<{ locale: string; surah: string }> }) {
  const { surah } = await params;
  const locale = asLocale((await params).locale);
  const n = resolveSurahParam(surah)?.surah ?? 1;
  const [meta, tq, ts] = await Promise.all([
    getMeta(),
    getTranslations({ locale: 'ar', namespace: 'Quran' }),
    getTranslations({ locale, namespace: 'Quran' }),
  ]);
  const s = meta.surahs[n - 1]!;
  return new ImageResponse(
    (
      <div style={{ display: 'flex', flexDirection: 'column', width: '100%', height: '100%', background: COLORS.canvas, padding: 72, fontFamily: 'Plex' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
            <BrandMark size={72} />
            <div style={{ display: 'flex', fontSize: 44, fontWeight: 600, color: COLORS.accent }}>نور · Noor</div>
          </div>
          <div style={{ display: 'flex', fontSize: 40, color: COLORS.muted }}>{String(n)}</div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', flex: 1, justifyContent: 'center', alignItems: 'center', gap: 24 }}>
          <Line text={tq('surahTitle', { name: s.name })} rtl style={{ fontSize: 132, fontWeight: 600, color: COLORS.ink, justifyContent: 'center' }} />
          <div style={{ display: 'flex', fontSize: 48, color: COLORS.muted }}>{`${s.transliteration} · ${s.englishName}`}</div>
        </div>
        <Line
          text={`${ts(`revelation.${s.revelationType}`)} · ${ts('ayahCount', { count: s.ayahCount })}`}
          rtl={locale === 'ar'}
          style={{ fontSize: 38, color: COLORS.accent, justifyContent: 'center' }}
        />
      </div>
    ),
    { ...OG_SIZE, fonts: await ogFonts() }
  );
}
