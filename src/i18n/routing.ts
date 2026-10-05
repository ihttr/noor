import { defineRouting } from 'next-intl/routing';

export const locales = ['ar', 'en'] as const;
export type Locale = (typeof locales)[number];

export const routing = defineRouting({
  locales,
  defaultLocale: 'ar',
  // Arabic lives at `/`, English at `/en/...` (SPEC §8).
  localePrefix: 'as-needed',
  // The URL alone decides the language: `/` is always Arabic, regardless of
  // Accept-Language, so links and search results are stable. No locale cookie.
  localeDetection: false,
  localeCookie: false,
});

export const directions: Record<Locale, 'rtl' | 'ltr'> = {
  ar: 'rtl',
  en: 'ltr',
};
