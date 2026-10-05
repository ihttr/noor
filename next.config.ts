// Must run before the next-intl plugin is loaded (see the file for why).
import './tooling/swc-native-cache';
import path from 'node:path';
import type { NextConfig } from 'next';
import createNextIntlPlugin from 'next-intl/plugin';

const nextConfig: NextConfig = {
  poweredByHeader: false,
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
