import type { MetadataRoute } from 'next';

// Installable app (SPEC §7.20): Arabic name and short name; the app opens in Arabic at "/".
export default function manifest(): MetadataRoute.Manifest {
  return {
    id: '/',
    name: 'نور — القرآن والأذكار',
    short_name: 'نور',
    description: 'رفيق هادئ لقراءة القرآن والأذكار اليومية',
    lang: 'ar',
    dir: 'rtl',
    start_url: '/',
    scope: '/',
    display: 'standalone',
    orientation: 'any',
    background_color: '#f8f6f1',
    theme_color: '#1e6b52',
    categories: ['books', 'education', 'lifestyle'],
    icons: [
      { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/icons/maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  };
}
