import { toNextJsHandler } from 'better-auth/next-js';
import { getAuth } from '@/lib/auth/server';

// Better Auth endpoints (/api/auth/*). Without a database, accounts are disabled (503).
const disabled = () => Response.json({ error: 'accounts-disabled' }, { status: 503 });

export async function GET(request: Request) {
  const auth = getAuth();
  return auth ? toNextJsHandler(auth).GET(request) : disabled();
}

export async function POST(request: Request) {
  const auth = getAuth();
  return auth ? toNextJsHandler(auth).POST(request) : disabled();
}
