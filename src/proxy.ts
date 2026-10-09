import createMiddleware from 'next-intl/middleware';
import { NextResponse, type NextRequest } from 'next/server';
import { routing } from './i18n/routing';
import { canonicalQuranPath } from './lib/quran/canonical-path';

const intl = createMiddleware(routing);

export default function proxy(request: NextRequest) {
  const target = canonicalQuranPath(request.nextUrl.pathname);
  if (target) {
    const url = request.nextUrl.clone();
    url.pathname = target;
    return NextResponse.redirect(url, 308);
  }
  return intl(request);
}

export const config = {
  // All pathnames except API routes, Next.js internals and files with an extension.
  matcher: '/((?!api|trpc|_next|_vercel|.*\\..*).*)',
};
