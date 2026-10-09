import { jsonLd } from '@/lib/seo';

/** Structured data for search engines (SPEC §9). */
export function JsonLd({ data }: { data: unknown }) {
  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd(data) }} />;
}
