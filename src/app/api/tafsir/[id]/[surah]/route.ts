import { getTafsirRegistry, getTafsirSurah } from '@/lib/tafsir/content';

// One surah of an imported tafsir as static JSON (verbatim text with its source), loaded lazily
// by the tafsir panel (SPEC §7.10).
export const dynamic = 'force-static';
export const dynamicParams = false;

export async function generateStaticParams() {
  const { tafsirs } = await getTafsirRegistry();
  return tafsirs.flatMap((t) => Array.from({ length: 114 }, (_, i) => ({ id: t.id, surah: String(i + 1) })));
}

export async function GET(_request: Request, ctx: RouteContext<'/api/tafsir/[id]/[surah]'>) {
  const { id, surah } = await ctx.params;
  return Response.json(await getTafsirSurah(id, Number(surah)), {
    headers: { 'Cache-Control': 'public, max-age=3600, stale-while-revalidate=86400' },
  });
}
