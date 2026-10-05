import localFont from 'next/font/local';

/*
 * Approved Quran fonts (D-011, D-036), self-hosted WOFF2, loaded only by reader routes.
 * - Amiri Quran (default): built from the approved TTF by scripts/build-fonts.ts (assets/fonts).
 * - Scheherazade New: SIL's own unmodified WOFF2 from the approved release (data/sources).
 * Only the default font is preloaded; Scheherazade loads when the reader selects it.
 */
export const amiriQuran = localFont({
  src: '../../../assets/fonts/AmiriQuran.woff2',
  variable: '--font-amiri-quran',
  display: 'swap',
  preload: true,
  adjustFontFallback: false,
  fallback: ['serif'],
});

export const scheherazadeNew = localFont({
  src: '../../../data/sources/fonts/scheherazade-new/ScheherazadeNew-Regular.woff2',
  variable: '--font-scheherazade',
  display: 'swap',
  preload: false,
  adjustFontFallback: false,
  fallback: ['serif'],
});

export const quranFontVariables = `${amiriQuran.variable} ${scheherazadeNew.variable}`;
