import type { Metadata } from 'next';

// SEO helpers (SPEC §9): canonical URLs, hreflang ar/en, Open Graph and JSON-LD. Arabic lives at
// "/", English under "/en"; `path` is always the locale-free path ("/quran/al-baqara").

// NEXT_PUBLIC_SITE_URL wins; on Vercel the production domain is known at build time.
export const SITE_URL = (
  process.env.NEXT_PUBLIC_SITE_URL ??
  (process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : 'http://localhost:3000')
).replace(/\/$/, '');

export function localizedPath(path: string, locale: string): string {
  if (locale === 'ar') return path;
  return path === '/' ? `/${locale}` : `/${locale}${path}`;
}

export const absoluteUrl = (path: string, locale: string): string => `${SITE_URL}${localizedPath(path, locale)}`;

export interface PageSeo {
  title: string;
  description?: string;
  /** Locale-free path of the page. */
  path: string;
  locale: string;
  /** Private or thin pages (SPEC §9): never indexed. */
  noindex?: boolean | 'follow';
  /** The home page uses the bare site name as its title. */
  absoluteTitle?: boolean;
}

export function pageMetadata({ title, description, path, locale, noindex, absoluteTitle }: PageSeo): Metadata {
  const url = localizedPath(path, locale);
  return {
    title: absoluteTitle ? { absolute: title } : title,
    description,
    alternates: {
      canonical: url,
      languages: { ar: localizedPath(path, 'ar'), en: localizedPath(path, 'en'), 'x-default': localizedPath(path, 'ar') },
    },
    openGraph: {
      type: 'website',
      siteName: locale === 'ar' ? 'نور' : 'Noor',
      title,
      description,
      url,
      locale: locale === 'ar' ? 'ar_AR' : 'en_US',
      alternateLocale: locale === 'ar' ? ['en_US'] : ['ar_AR'],
    },
    twitter: { card: 'summary_large_image', title, description },
    ...(noindex ? { robots: { index: false, follow: noindex === 'follow' } } : {}),
  };
}

export interface Crumb {
  name: string;
  path: string;
}

/** JSON-LD `BreadcrumbList` (SPEC §9). */
export function breadcrumbJsonLd(crumbs: readonly Crumb[], locale: string) {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: crumbs.map((c, i) => ({ '@type': 'ListItem', position: i + 1, name: c.name, item: absoluteUrl(c.path, locale) })),
  };
}

/** JSON-LD `WebSite` with a `SearchAction` for the Quran search (SPEC §9). */
export function websiteJsonLd(name: string, locale: string) {
  return {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    name,
    url: absoluteUrl('/', locale),
    inLanguage: locale,
    potentialAction: {
      '@type': 'SearchAction',
      target: { '@type': 'EntryPoint', urlTemplate: `${absoluteUrl('/search', locale)}?q={search_term_string}` },
      'query-input': 'required name=search_term_string',
    },
  };
}

/** Serializes JSON-LD for a <script> element (`<` escaped so the script cannot be closed early). */
export const jsonLd = (data: unknown): string => JSON.stringify(data).replace(/</g, '\\u003c');
