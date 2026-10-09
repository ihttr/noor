import { getTranslationRegistry, getTranslationSurah } from '@/lib/translations/content';

// One surah of an imported translation (SPEC §7.9), loaded lazily under the ayahs in reading mode.
// No translation is approved yet (D-020), so there are no pages to generate for now.
export const dynamic = 'force-static';
export const dynamicParams = false;

export async function generateStaticParams() {
  const { translations } = await getTranslationRegistry();
  return translations.flatMap((t) => Array.from({ length: 114 }, (_, i) => ({ id: t.id, surah: String(i + 1) })));
}

export async function GET(_request: Request, ctx: RouteContext<'/api/translations/[id]/[surah]'>) {
  const { id, surah } = await ctx.params;
  return Response.json(await getTranslationSurah(id, Number(surah)), {
    headers: { 'Cache-Control': 'public, max-age=3600, stale-while-revalidate=86400' },
  });
}
