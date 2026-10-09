import { readFile } from 'node:fs/promises';
import path from 'node:path';

// The approved reciter list (Islamic Network CDN, D-054), loaded by the audio player.
export const dynamic = 'force-static';

export async function GET() {
  const list = JSON.parse(await readFile(path.join(process.cwd(), 'content/audio/reciters.json'), 'utf8')) as unknown;
  return Response.json(list, { headers: { 'Cache-Control': 'public, max-age=3600, stale-while-revalidate=86400' } });
}
