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

const withNextIntl = createNextIntlPlugin('./src/i18n/request.ts');

export default withNextIntl(nextConfig);
