// Must run before the next-intl plugin is loaded (see the file for why).
import './tooling/swc-native-cache';
import path from 'node:path';
import type { NextConfig } from 'next';
import createNextIntlPlugin from 'next-intl/plugin';

// One id per build, shared with the static-generation workers through the environment: it
// versions the service worker (src/app/sw.js/route.ts, D-068).
process.env.NOOR_BUILD_ID ??= `${(process.env.VERCEL_GIT_COMMIT_SHA ?? 'local').slice(0, 12)}-${Date.now().toString(36)}`;

// Security headers (SPEC §12, DECISIONS D-069). The CSP allows only this origin for scripts,
// styles, fonts and connections; audio may also stream from the Islamic Network CDN (D-054).
// 'unsafe-inline' for scripts is needed by the statically generated pages (Next.js inline data
// and the theme boot script): nonces would make every page dynamic (D-069). Development keeps
// Next.js defaults (its tooling uses eval).
const AUDIO_CDN = 'https://cdn.islamic.network';
const CSP = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self'",
  `media-src 'self' data: blob: ${AUDIO_CDN}`,
  `connect-src 'self' ${AUDIO_CDN}`,
  "worker-src 'self' blob:",
  "manifest-src 'self'",
  "frame-src 'none'",
  "frame-ancestors 'none'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
].join('; ');

const SECURITY_HEADERS = [
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'Cross-Origin-Opener-Policy', value: 'same-origin' },
  { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains' },
  {
    key: 'Permissions-Policy',
    value: 'camera=(), microphone=(), payment=(), usb=(), bluetooth=(), geolocation=(self), accelerometer=(self), gyroscope=(self), magnetometer=(self), screen-wake-lock=(self)',
  },
];

const nextConfig: NextConfig = {
  poweredByHeader: false,
  async headers() {
    const production = process.env.NODE_ENV === 'production';
    return [{ source: '/:path*', headers: production ? [...SECURITY_HEADERS, { key: 'Content-Security-Policy', value: CSP }] : SECURITY_HEADERS }];
  },
  turbopack: {
    // Pin the project root: a stray lockfile in a parent folder must not change it.
    root: path.resolve(import.meta.dirname),
  },
};

const withNextIntl = createNextIntlPlugin({
  requestConfig: './src/i18n/request.ts',
  experimental: {
    // Messages are compiled at build time, so the ICU parser/formatter is not shipped to the
    // browser (~17 KB gzipped) — needed for the reader's 150 KB JS budget (SPEC §11, D-040).
    messages: { path: './messages', format: 'json', locales: 'infer', precompile: true },
  },
});

export default withNextIntl(nextConfig);
