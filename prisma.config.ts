import { defineConfig } from 'prisma/config';

// The Prisma CLI does not read .env files by itself; Next.js loads them only for the app.
// Existing environment variables win (e.g. in CI); missing files are fine.
for (const file of ['.env.local', '.env']) {
  try {
    process.loadEnvFile(file);
  } catch {
    // optional
  }
}

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
  },
  datasource: {
    // Migrations need a direct (non-pooled) connection on Neon; fall back to DATABASE_URL locally.
    url: process.env.DIRECT_URL ?? process.env.DATABASE_URL,
  },
});
