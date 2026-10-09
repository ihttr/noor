import { readFile } from 'node:fs/promises';
import path from 'node:path';

// The bundled GeoNames city list (D-057), fetched by the place picker only when the user searches.
export const dynamic = 'force-static';

export async function GET() {
  const body = await readFile(path.join(process.cwd(), 'content/cities/cities.json'), 'utf8');
  return new Response(body, {
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'public, max-age=86400, stale-while-revalidate=604800' },
  });
}
