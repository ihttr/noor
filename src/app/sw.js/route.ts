import { readFileSync } from 'node:fs';
import path from 'node:path';

// The service worker (SPEC §7.20, D-068), stamped with the build id so that every deployment
// installs a new version. Generated at build time; browsers re-check it on every navigation.
export const dynamic = 'force-static';

export function GET() {
  const source = readFileSync(path.join(process.cwd(), 'src', 'sw', 'service-worker.js'), 'utf8');
  return new Response(source.replaceAll('__NOOR_BUILD__', process.env.NOOR_BUILD_ID ?? 'development'), {
    headers: {
      'Content-Type': 'application/javascript; charset=utf-8',
      'Cache-Control': 'no-cache',
    },
  });
}
