import 'server-only';

// A small sliding-window limiter per key (SPEC §12: rate limiting on sync). It lives in the memory
// of one server instance, so on serverless hosting it limits per instance — a guard against
// runaway clients, not a security boundary. Better Auth limits its own endpoints separately.

const hits = new Map<string, number[]>();

export function rateLimited(key: string, limit: number, windowMs: number, now = Date.now()): boolean {
  const recent = (hits.get(key) ?? []).filter((t) => now - t < windowMs);
  recent.push(now);
  hits.set(key, recent);
  if (hits.size > 10_000) hits.clear();
  return recent.length > limit;
}

/** Same-origin check for cookie-authenticated POSTs (CSRF, SPEC §12). */
export function sameOrigin(request: Request): boolean {
  const origin = request.headers.get('origin');
  if (!origin) return false;
  const allowed = new Set([new URL(request.url).origin]);
  if (process.env.BETTER_AUTH_URL) allowed.add(new URL(process.env.BETTER_AUTH_URL).origin);
  return allowed.has(origin);
}
