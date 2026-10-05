// Generates content/quran/meta.json, content/quran/surah/{1..114}.json and
// content/search/index.json from the owner-approved Tanzil files only.
//
// Usage (PowerShell or any shell):  node scripts/import-quran.ts
//
// Steps: verify SHA-256 of every approved file against SOURCES.lock.json → parse strictly →
// check structure and Basmala (stop on anything unexpected) → write → print a summary.
// Run `node scripts/verify-content.ts` afterwards.
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { buildContent } from './quran/build.ts';
import { stringifyContent } from './quran/json.ts';
import { SourceSurprise } from './quran/parse.ts';
import { ROOT, loadAllApproved } from './quran/sources.ts';

async function write(relativePath: string, value: unknown): Promise<number> {
  const file = path.join(ROOT, relativePath);
  await mkdir(path.dirname(file), { recursive: true });
  const body = `${stringifyContent(value)}\n`;
  await writeFile(file, body, 'utf8');
  return Buffer.byteLength(body);
}

async function main(): Promise<void> {
  const files = await loadAllApproved();
  for (const f of Object.values(files)) console.log(`✓ ${f.use}: ${f.path} (SHA-256 verified)`);

  const { meta, surahs, searchIndex } = buildContent(files);

  let bytes = await write('content/quran/meta.json', meta);
  for (const surah of surahs) bytes += await write(`content/quran/surah/${surah.surah}.json`, surah);
  const indexBytes = await write('content/search/index.json', searchIndex);

  console.log(
    `\nWrote content/quran: meta.json + ${surahs.length} surah files (${(bytes / 1024).toFixed(0)} KB), ` +
      `${meta.counts.ayahs} ayahs, ${meta.counts.pages} pages, ${meta.counts.juz} juz, ` +
      `${meta.counts.hizbQuarters} hizb quarters, ${meta.counts.sajdahs} sajdahs.`
  );
  console.log(`Wrote content/search/index.json (${(indexBytes / 1024).toFixed(0)} KB, ${searchIndex.entries.length} entries).`);
  console.log(`Integrity SHA-256 (ayahs): ${meta.integrity.ayahs}`);
}

main().catch((err: unknown) => {
  if (err instanceof SourceSurprise) {
    console.error(`\nSTOPPED — the source data contains something unexpected. Nothing was "fixed":\n  ${err.message}`);
  } else {
    console.error(`\nFAILED: ${err instanceof Error ? err.message : String(err)}`);
  }
  process.exit(1);
});
