import { getMeta, getSearchIndex } from '@/lib/quran/content';
import { divisionAt } from '@/lib/quran/structure';

// The normalized search index (SPEC §7.8) for the search worker, with each ayah's juz for the
// juz filter. Never displayed as Quran. ~200 KB gzipped, loaded once.
export const dynamic = 'force-static';

export async function GET() {
  const [index, meta] = await Promise.all([getSearchIndex(), getMeta()]);
  return Response.json(
    {
      purpose: index.purpose,
      normalization: index.normalization,
      entries: index.entries,
      juz: index.entries.map((_, i) => divisionAt(meta, meta.juz, i)),
    },
    { headers: { 'Cache-Control': 'public, max-age=3600, stale-while-revalidate=86400' } }
  );
}
