import type { Metadata, Viewport } from 'next';
import { hasLocale, NextIntlClientProvider } from 'next-intl';
import { getTranslations } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { AppShell } from '@/components/shell/AppShell';
import { ThemeSync } from '@/components/theme/ThemeSync';
import { directions, routing } from '@/i18n/routing';
import { uiFont } from '@/lib/fonts';
import { readerBootScript } from '@/lib/reader/settings';
import { themeBootScript } from '@/lib/theme';
import '../globals.css';

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('Shell');
  return {
    metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000'),
    title: { default: t('brand'), template: `%s · ${t('brand')}` },
    description: t('tagline'),
    applicationName: t('brand'),
  };
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#f8f6f1' },
    { media: '(prefers-color-scheme: dark)', color: '#0e1210' },
  ],
};

export default async function LocaleLayout({ children, params }: LayoutProps<'/[locale]'>) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();

  return (
    // data-theme is set by the boot script before paint, so React must not complain about it.
    <html lang={locale} dir={directions[locale]} className={uiFont.variable} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeBootScript + readerBootScript }} />
      </head>
      <body>
        <NextIntlClientProvider>
          <ThemeSync />
          <AppShell>{children}</AppShell>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
