import { getAuth } from '@/lib/auth/server';
import { prisma } from '@/lib/server/db';
import { rateLimited, sameOrigin } from '@/lib/server/rate-limit';
import { parseSyncRequest } from '@/lib/sync/protocol';
import { handleSync } from '@/lib/sync/server';

// POST /api/sync { cursor, changes } → { changes, cursor, more } (SPEC §5).
export const dynamic = 'force-dynamic';

const MAX_BODY = 2_000_000;

export async function POST(request: Request) {
  const auth = getAuth();
  if (!auth) return Response.json({ error: 'accounts-disabled' }, { status: 503 });
  if (!sameOrigin(request)) return Response.json({ error: 'forbidden' }, { status: 403 });
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session) return Response.json({ error: 'signed-out' }, { status: 401 });
  if (rateLimited(`sync:${session.user.id}`, 60, 60_000)) return Response.json({ error: 'rate-limited' }, { status: 429 });
  if (Number(request.headers.get('content-length') ?? 0) > MAX_BODY) return Response.json({ error: 'too-large' }, { status: 413 });

  let body: unknown;
  try {
    const text = await request.text();
    if (text.length > MAX_BODY) return Response.json({ error: 'too-large' }, { status: 413 });
    body = JSON.parse(text);
  } catch {
    return Response.json({ error: 'invalid-json' }, { status: 400 });
  }
  const parsed = parseSyncRequest(body);
  if (!parsed) return Response.json({ error: 'invalid-request' }, { status: 400 });
  return Response.json(await handleSync(prisma(), session.user.id, parsed), { headers: { 'Cache-Control': 'no-store' } });
}
