import { ImageResponse } from 'next/og';
import { getTranslations } from 'next-intl/server';
import { routing } from '@/i18n/routing';
import { BrandMark, COLORS, Line, OG_SIZE, ogFonts } from '@/lib/og/og';

type Locale = (typeof routing.locales)[number];
const asLocale = (v: string): Locale => ((routing.locales as readonly string[]).includes(v) ? (v as Locale) : routing.defaultLocale);

export const size = OG_SIZE;
export const contentType = 'image/png';
export const alt = 'Noor';

/** Default Open Graph image of every page (SPEC §9). */
export default async function Image({ params }: { params: Promise<{ locale: string }> }) {
  const locale = asLocale((await params).locale);
  const t = await getTranslations({ locale, namespace: 'Shell' });
  const rtl = locale === 'ar';
  return new ImageResponse(
    (
      <div style={{ display: 'flex', flexDirection: 'column', width: '100%', height: '100%', background: COLORS.canvas, alignItems: 'center', justifyContent: 'center', gap: 36, fontFamily: 'Plex' }}>
        <BrandMark size={140} />
        <div style={{ display: 'flex', fontSize: 120, fontWeight: 600, color: COLORS.ink }}>{t('brand')}</div>
        <Line text={t('tagline')} rtl={rtl} style={{ fontSize: 46, color: COLORS.muted, maxWidth: 1000, justifyContent: 'center' }} />
      </div>
    ),
    { ...OG_SIZE, fonts: await ogFonts() }
  );
}
