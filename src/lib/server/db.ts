import 'server-only';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@/generated/prisma/client';

// User data only (SPEC §4). Accounts and sync are switched off when no database is configured,
// so the app (reading, adhkar, prayer…) keeps working everywhere without one.

export const hasDatabase = (): boolean => Boolean(process.env.DATABASE_URL);

const globalForPrisma = globalThis as unknown as { noorPrisma?: PrismaClient };

export function prisma(): PrismaClient {
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is not set: accounts and sync are disabled');
  // DATABASE_POOL_MAX=1 for the PGlite development database (scripts/dev-db.ts): its socket
  // shares one backend between connections, so concurrent statements must not interleave.
  const max = Number(process.env.DATABASE_POOL_MAX) || undefined;
  globalForPrisma.noorPrisma ??= new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL, ...(max ? { max } : {}) }) });
  return globalForPrisma.noorPrisma;
}
