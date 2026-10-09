import type { MetadataRoute } from 'next';
import { getAdhkarIndex } from '@/lib/adhkar/content';
import { allSlugs } from '@/lib/quran/slugs';
import { absoluteUrl } from '@/lib/seo';

// sitemap.xml (SPEC §9): main pages, the 114 surahs, the 30 juz and the adhkar categories with
// content, each in Arabic and English with hreflang alternates. Private pages are not listed.
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const index = await getAdhkarIndex();
  const pages: [string, number][] = [
    ['/', 1],
    ['/quran', 0.9],
    ...allSlugs().map((slug): [string, number] => [`/quran/${slug}`, 0.8]),
    ...Array.from({ length: 30 }, (_, i): [string, number] => [`/juz/${i + 1}`, 0.6]),
    ['/adhkar', 0.8],
    ...index.categories.filter((c) => c.count > 0).map((c): [string, number] => [`/adhkar/${c.id}`, 0.7]),
    ['/prayer', 0.6],
    ['/qibla', 0.5],
    ['/calendar', 0.5],
    ['/tasbih', 0.5],
    ['/about', 0.3],
    ['/privacy', 0.2],
  ];
  return pages.flatMap(([path, priority]) =>
    (['ar', 'en'] as const).map((locale) => ({
      url: absoluteUrl(path, locale),
      priority,
      alternates: { languages: { ar: absoluteUrl(path, 'ar'), en: absoluteUrl(path, 'en'), 'x-default': absoluteUrl(path, 'ar') } },
    }))
  );
}
