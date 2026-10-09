// Generates content/adhkar/index.json and content/adhkar/{morning,evening}.json from the
// owner-approved Seen-Arabic dataset (D-019, D-055) and the curated Quran mapping.
//
// Usage (PowerShell or any shell):  node scripts/import-adhkar.ts
// Run `node scripts/verify-content.ts` afterwards.
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { buildAdhkar, type QuranMapping } from './adhkar/build.ts';
import { stringifyContent } from './quran/json.ts';
import { SourceSurprise } from './quran/parse.ts';
import { ROOT, loadApproved } from './quran/sources.ts';
import type { SearchIndexFile } from '../src/lib/quran/types.ts';

async function write(relativePath: string, value: unknown): Promise<void> {
  const file = path.join(ROOT, relativePath);
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, `${stringifyContent(value)}\n`, 'utf8');
}

async function main(): Promise<void> {
  const [ar, en] = [await loadApproved('adhkar-seen-arabic-ar'), await loadApproved('adhkar-seen-arabic-en')];
  console.log(`✓ ${ar.path}, ${en.path} (SHA-256 verified)`);
  const mapping = JSON.parse(await readFile(path.join(ROOT, 'data/curated/adhkar-quran.json'), 'utf8')) as QuranMapping;
  const search = JSON.parse(await readFile(path.join(ROOT, 'content/search/index.json'), 'utf8')) as SearchIndexFile;
  const { index, categories } = buildAdhkar(ar, en, mapping, search);
  await write('content/adhkar/index.json', index);
  for (const c of categories) await write(`content/adhkar/${c.id}.json`, c);
  console.log(`Wrote content/adhkar: ${categories.map((c) => `${c.id} (${c.items.length})`).join(', ')}; other categories empty.`);
}

main().catch((err: unknown) => {
  const prefix = err instanceof SourceSurprise ? 'STOPPED — the source data contains something unexpected. Nothing was "fixed":' : 'FAILED:';
  console.error(`\n${prefix}\n  ${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
});
