import { getSurah } from '@/lib/quran/content';

// One surah chunk of content/ as static JSON (verbatim text with its Tanzil notice), for client
// views that show ayahs outside the reader, such as Saved. Also the chunk the offline download
// (Phase 11) will fetch.
export const dynamic = 'force-static';
export const dynamicParams = false;

export function generateStaticParams() {
  return Array.from({ length: 114 }, (_, i) => ({ surah: String(i + 1) }));
}

export async function GET(_request: Request, ctx: RouteContext<'/api/quran/surah/[surah]'>) {
  const n = Number((await ctx.params).surah);
  return Response.json(await getSurah(n), {
    headers: { 'Cache-Control': 'public, max-age=3600, stale-while-revalidate=86400' },
  });
}
