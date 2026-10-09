// A local PostgreSQL for development and end-to-end tests without Docker (D-062): PGlite
// (Postgres compiled to WebAssembly) behind a Postgres wire-protocol socket, with the Prisma
// migrations applied by `prisma migrate deploy`.
//
// Usage (PowerShell or any shell):
//   node scripts/dev-db.ts                         # .cache/pglite-dev on port 5433, kept between runs
//   node scripts/dev-db.ts --memory --port 5434    # throw-away database (used by the e2e tests)
// Then: DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:5433/postgres?sslmode=disable
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { PGlite } from '@electric-sql/pglite';
import { PGLiteSocketServer } from '@electric-sql/pglite-socket';

const args = process.argv.slice(2);
const flag = (name: string) => args.includes(name);
const option = (name: string, fallback: string) => {
  const i = args.indexOf(name);
  return i >= 0 && args[i + 1] ? args[i + 1]! : fallback;
};

const port = Number(option('--port', '5433'));
const dataDir = flag('--memory') ? undefined : path.resolve(option('--db', '.cache/pglite-dev'));
if (dataDir) mkdirSync(dataDir, { recursive: true });

const db = new PGlite(dataDir);
await db.waitReady;
const urlFor = (address: string) => `postgresql://postgres:postgres@${address}/postgres?sslmode=disable`;

// Migrate through a temporary socket first (asynchronously: this process serves the database
// while Prisma migrates it), so the real port only opens once the schema is ready.
const migrator = new PGLiteSocketServer({ db, port: 0, host: '127.0.0.1', maxConnections: 4 });
await migrator.start();
const { stdout } = await promisify(execFile)(process.execPath, [path.join('node_modules', 'prisma', 'build', 'index.js'), 'migrate', 'deploy'], {
  env: { ...process.env, DATABASE_URL: urlFor(migrator.getServerConn()), DIRECT_URL: urlFor(migrator.getServerConn()) },
});
await migrator.stop();
console.log(stdout.trim());

const server = new PGLiteSocketServer({ db, port, host: '127.0.0.1', maxConnections: 10 });
await server.start();
const url = urlFor(`127.0.0.1:${port}`);
console.log(`PGlite ready at ${url}${dataDir ? ` (data in ${dataDir})` : ' (in memory)'}`);

const stop = async () => {
  await server.stop();
  await db.close();
  process.exit(0);
};
process.on('SIGINT', () => void stop());
process.on('SIGTERM', () => void stop());
