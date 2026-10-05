import { execFileSync } from 'node:child_process';
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { PGlite } from '@electric-sql/pglite';
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

  it('match the Prisma schema (initial migration == empty → schema diff)', () => {
    // Valid while there is a single migration; later phases switch to a shadow-database check.
    expect(migrationDirs).toHaveLength(1);
    const cli = path.join(process.cwd(), 'node_modules', 'prisma', 'build', 'index.js');
    const expected = execFileSync(
      process.execPath,
      [cli, 'migrate', 'diff', '--from-empty', '--to-schema', 'prisma/schema.prisma', '--script'],
      { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }
    );
    expect(readMigration(migrationDirs[0]!).trim()).toBe(expected.trim());
  });
});
