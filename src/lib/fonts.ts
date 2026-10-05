import localFont from 'next/font/local';

/*
 * UI font: IBM Plex Sans Arabic (SIL OFL 1.1, Reserved Font Name "Plex"), self-hosted.
 * The files are IBM's own unmodified WOFF2 builds, taken directly from the provenance-tracked
 * download in data/sources (see SOURCES.lock.json, id `font-ibm-plex-sans-arabic`). Using them
 * unmodified avoids the OFL renaming requirement that a self-made subset would trigger (D-015).
 *
 * The Quran font is intentionally absent until it is approved (DECISIONS D-011).
 */
export const uiFont = localFont({
  src: [
    {
      path: '../../data/sources/fonts/ibm-plex-sans-arabic/IBMPlexSansArabic-Regular.woff2',
      weight: '400',
      style: 'normal',
    },
    {
      path: '../../data/sources/fonts/ibm-plex-sans-arabic/IBMPlexSansArabic-SemiBold.woff2',
      weight: '600',
      style: 'normal',
    },
  ],
  variable: '--font-ui',
  display: 'swap',
  fallback: ['Segoe UI', 'Tahoma', 'Arial', 'sans-serif'],
});
