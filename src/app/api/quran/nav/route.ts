import { getMeta } from '@/lib/quran/content';
import { toNavData } from '@/lib/quran/nav';
import { slugOf } from '@/lib/quran/slugs';

// Structure + surah names for client-side jumps (no Quran text). Generated once at build time.
export const dynamic = 'force-static';

export async function GET() {
  return Response.json(toNavData(await getMeta(), slugOf), {
    headers: { 'Cache-Control': 'public, max-age=3600, stale-while-revalidate=86400' },
  });
}
