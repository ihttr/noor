import { getAdhkarCategory, getAdhkarIndex, isAdhkarCategory } from '@/lib/adhkar/content';

// One adhkar category as static JSON (for Saved and the home page).
export const dynamic = 'force-static';
export const dynamicParams = false;

export async function generateStaticParams() {
  const { categories } = await getAdhkarIndex();
  return categories.filter((c) => c.count > 0).map((c) => ({ category: c.id }));
}

export async function GET(_request: Request, ctx: RouteContext<'/api/adhkar/[category]'>) {
  const { category } = await ctx.params;
  const file = isAdhkarCategory(category) ? await getAdhkarCategory(category) : null;
  if (!file) return new Response('Not found', { status: 404 });
  return Response.json(file, { headers: { 'Cache-Control': 'public, max-age=3600, stale-while-revalidate=86400' } });
}
