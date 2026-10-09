import type { MetadataRoute } from 'next';
import { SITE_URL } from '@/lib/seo';

// robots.txt (SPEC §9). Private pages carry `noindex` themselves (crawlers must be able to see it).
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [{ userAgent: '*', allow: '/', disallow: ['/api/'] }],
    sitemap: `${SITE_URL}/sitemap.xml`,
    host: SITE_URL,
  };
}
