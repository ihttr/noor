import { getAuth } from '@/lib/auth/server';
import { prisma } from '@/lib/server/db';
import { exportUserData } from '@/lib/sync/server';

// "Export my data" (SPEC §7.19): everything stored for the signed-in user, as JSON.
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const auth = getAuth();
  if (!auth) return Response.json({ error: 'accounts-disabled' }, { status: 503 });
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session) return Response.json({ error: 'signed-out' }, { status: 401 });
  const db = prisma();
  const user = await db.user.findUnique({ where: { id: session.user.id }, select: { email: true, name: true, createdAt: true } });
  const body = { exportedAt: new Date().toISOString(), account: user, data: await exportUserData(db, session.user.id) };
  return new Response(JSON.stringify(body, null, 2), {
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Content-Disposition': `attachment; filename="noor-export-${new Date().toISOString().slice(0, 10)}.json"`,
      'Cache-Control': 'no-store',
    },
  });
}
