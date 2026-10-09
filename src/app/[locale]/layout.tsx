import type { Metadata, Viewport } from 'next';
import { hasLocale, NextIntlClientProvider } from 'next-intl';
import { getTranslations } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { AppShell } from '@/components/shell/AppShell';
import { SyncManager } from '@/components/account/SyncManager';
import { PreferencesSync } from '@/components/prefs/PreferencesSync';
import { ServiceWorker } from '@/components/pwa/ServiceWorker';
import { directions, routing } from '@/i18n/routing';
import { uiFont } from '@/lib/fonts';
import { readerBootScript } from '@/lib/reader/settings';
import { SITE_URL } from '@/lib/seo';
import { themeBootScript } from '@/lib/theme';
import '../globals.css';

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('Shell');
  return {
    metadataBase: new URL(SITE_URL),
    title: { default: t('brand'), template: `%s · ${t('brand')}` },
    description: t('tagline'),
    applicationName: t('brand'),
    // Installed on iOS ("Add to Home Screen", SPEC §7.20, §14).
    appleWebApp: { capable: true, title: t('brand'), statusBarStyle: 'default' },
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
          <PreferencesSync />
          <SyncManager />
          <ServiceWorker />
          <AppShell>{children}</AppShell>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
