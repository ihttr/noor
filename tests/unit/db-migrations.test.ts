import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { PGlite } from '@electric-sql/pglite';
import { PGLiteSocketServer } from '@electric-sql/pglite-socket';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

// Applies the committed Prisma migrations to PGlite (real Postgres compiled to WASM), so the
// migrations are verified on Windows and in CI without Docker or a database server.

const MIGRATIONS = path.join(process.cwd(), 'prisma', 'migrations');
const migrationDirs = readdirSync(MIGRATIONS, { withFileTypes: true })
  .filter((d) => d.isDirectory())
  .map((d) => d.name)
  .sort();
const readMigration = (dir: string) => readFileSync(path.join(MIGRATIONS, dir, 'migration.sql'), 'utf8');

let db: PGlite;

beforeAll(async () => {
  db = new PGlite();
  for (const dir of migrationDirs) await db.exec(readMigration(dir));
});

afterAll(async () => {
  await db.close();
});

describe('Prisma migrations', () => {
  it('create every table of SPEC §5', async () => {
    const { rows } = await db.query<{ table_name: string }>(
      "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' ORDER BY table_name"
    );
    expect(rows.map((r) => r.table_name)).toEqual(
      [
        'account',
        'adhkar_day',
        'collection',
        'goal',
        'memorization_item',
        'note',
        'reading_day',
        'reading_position',
        'saved_item',
        'session',
        'tasbih_session',
        'user',
        'user_preferences',
        'verification',
      ].sort()
    );
  });

  it('enforce one reading day per user and date, and delete user data with the user', async () => {
    await db.exec(`INSERT INTO "user" (id, name, email) VALUES ('u1', '', 'a@example.com')`);
    const insertDay = `INSERT INTO reading_day (id, "userId", date, "pagesRead", "updatedAt")
      VALUES (gen_random_uuid(), 'u1', '2026-10-04', '{1,2}', now())`;
    await db.exec(insertDay);
    await expect(db.exec(insertDay)).rejects.toThrow(/unique/i);

    await db.exec(`DELETE FROM "user" WHERE id = 'u1'`);
    const { rows } = await db.query<{ n: number }>('SELECT count(*)::int AS n FROM reading_day');
    expect(rows[0]?.n).toBe(0);
  });

  it('bump the sync sequence on every insert and update (D-016, D-061)', async () => {
    await db.exec(`INSERT INTO "user" (id, name, email) VALUES ('u2', '', 'b@example.com')`);
    const seq = async () => (await db.query<{ s: string }>(`SELECT "serverSeq"::text AS s FROM collection WHERE id = '00000000-0000-4000-8000-000000000001'`)).rows[0]!.s;
    await db.exec(`INSERT INTO collection (id, "userId", name, "updatedAt") VALUES ('00000000-0000-4000-8000-000000000001', 'u2', 'a', now())`);
    const first = BigInt(await seq());
    await db.exec(`UPDATE collection SET name = 'b' WHERE id = '00000000-0000-4000-8000-000000000001'`);
    expect(BigInt(await seq())).toBeGreaterThan(first);
  });

  it('match the Prisma schema exactly (prisma migrate diff against the migrated database)', async () => {
    // PGlite is served over the Postgres wire protocol so the Prisma CLI can introspect it.
    const server = new PGLiteSocketServer({ db, port: 0, host: '127.0.0.1' });
    await server.start();
    try {
      const url = `postgresql://postgres:postgres@${server.getServerConn()}/postgres?sslmode=disable`;
      const cli = path.join(process.cwd(), 'node_modules', 'prisma', 'build', 'index.js');
      const result = await promisify(execFile)(
        process.execPath,
        [cli, 'migrate', 'diff', '--from-config-datasource', '--to-schema', 'prisma/schema.prisma', '--exit-code'],
        { env: { ...process.env, DATABASE_URL: url, DIRECT_URL: url } }
      ).then(
        (r) => ({ code: 0, out: r.stdout }),
        (e: { code?: number; stdout?: string }) => ({ code: e.code ?? 1, out: e.stdout ?? '' })
      );
      expect(result.out).toContain('No difference detected');
      expect(result.code).toBe(0);
    } finally {
      await server.stop();
    }
  }, 120_000);
});
