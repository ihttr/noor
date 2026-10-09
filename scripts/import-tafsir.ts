// Generates content/tafsir/{id}/surah/{1..114}.json and content/tafsir/registry.json from the
// owner-approved tafsir sources only (SPEC §7.10, DECISIONS D-049).
//
// Usage (PowerShell or any shell):  node scripts/import-tafsir.ts
// Run `node scripts/verify-content.ts` afterwards.
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { stringifyContent } from './quran/json.ts';
import { SourceSurprise } from './quran/parse.ts';
import { ROOT, loadApproved } from './quran/sources.ts';
import { TAFSIRS, buildTafsir } from './tafsir/build.ts';
import type { QuranMeta } from '../src/lib/quran/types.ts';
import type { TafsirRegistry } from '../src/lib/tafsir/types.ts';

async function write(relativePath: string, value: unknown): Promise<number> {
  const file = path.join(ROOT, relativePath);
  await mkdir(path.dirname(file), { recursive: true });
  const body = `${stringifyContent(value)}\n`;
  await writeFile(file, body, 'utf8');
  return Buffer.byteLength(body);
}

async function main(): Promise<void> {
  const meta = JSON.parse(await readFile(path.join(ROOT, 'content/quran/meta.json'), 'utf8')) as QuranMeta;
  const ayahCounts = meta.surahs.map((s) => s.ayahCount);
  const registry: TafsirRegistry = { schemaVersion: 1, tafsirs: [] };

  for (const def of Object.values(TAFSIRS)) {
    const file = await loadApproved(def.use);
    console.log(`✓ ${def.use}: ${file.path} (SHA-256 verified)`);
    const { registry: entry, surahs } = buildTafsir(def, file, def.read(file), ayahCounts);
    let bytes = 0;
    for (const s of surahs) bytes += await write(`content/tafsir/${def.id}/surah/${s.surah}.json`, s);
    registry.tafsirs.push(entry);
    console.log(`Wrote content/tafsir/${def.id}: ${surahs.length} surah files, ${entry.entries} entries (${(bytes / 1024).toFixed(0)} KB).`);
    console.log(`Integrity SHA-256: ${entry.integrity}`);
  }
  await write('content/tafsir/registry.json', registry);
}

main().catch((err: unknown) => {
  if (err instanceof SourceSurprise) {
    console.error(`\nSTOPPED — the source data contains something unexpected. Nothing was "fixed":\n  ${err.message}`);
  } else {
    console.error(`\nFAILED: ${err instanceof Error ? err.message : String(err)}`);
  }
  process.exit(1);
});
