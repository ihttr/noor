// Imports one translation into content/translations/{id}/surah/{1..114}.json and updates
// content/translations/registry.json (SPEC §7.9). Only files the owner approved for the use
// `translation:<id>` in SOURCES.lock.json are read (D-032); the SHA-256 is verified first.
//
// Usage (PowerShell or any shell):  node scripts/import-translation.ts <id>
//   ids: quranenc-english_saheeh, quranenc-english_rwwad, quranenc-english_hilali_khan,
//        tanzil-en.sahih, tanzil-en.pickthall, tanzil-en.yusufali, tanzil-en.hilali, tanzil-en.itani
// As of 2026-10-09 no translation is approved (D-020), so the script refuses to run.
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { stringifyContent } from './quran/json.ts';
import { SourceSurprise } from './quran/parse.ts';
import { ROOT, loadApproved } from './quran/sources.ts';
import { canonicalTafsirHash, checkCoverage } from './tafsir/build.ts';
import { TRANSLATIONS } from './translation/definitions.ts';
import type { QuranMeta } from '../src/lib/quran/types.ts';
import type { TranslationRegistry, TranslationSurahFile } from '../src/lib/translations/types.ts';

async function write(relativePath: string, value: unknown): Promise<void> {
  const file = path.join(ROOT, relativePath);
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, `${stringifyContent(value)}\n`, 'utf8');
}

async function main(): Promise<void> {
  const id = process.argv[2];
  const def = id ? TRANSLATIONS[id] : undefined;
  if (!def) throw new Error(`Unknown translation "${id ?? ''}". Known: ${Object.keys(TRANSLATIONS).join(', ')}`);

  const file = await loadApproved(`translation:${def.id}`, def.file);
  console.log(`✓ translation:${def.id}: ${file.path} (SHA-256 verified)`);
  const xml = file.bytes.toString('utf8');
  const named = def.translatorInFile?.(xml);
  if (named !== undefined && named !== def.translator) {
    throw new SourceSurprise(`${file.path} names the translator "${named ?? ''}", expected "${def.translator}"`);
  }
  const rows = def.parse(xml, file.path);
  const meta = JSON.parse(await readFile(path.join(ROOT, 'content/quran/meta.json'), 'utf8')) as QuranMeta;
  checkCoverage(rows, meta.surahs.map((s) => s.ayahCount), def.id);

  const source = {
    name: def.distribution,
    url: def.url,
    version: def.version(xml),
    downloadedAt: (file.entry.downloadedAt ?? '').slice(0, 10),
  };
  for (const s of meta.surahs) {
    const surahFile: TranslationSurahFile = {
      schemaVersion: 1,
      id: def.id,
      surah: s.number,
      translator: def.translator,
      source,
      entries: rows
        .filter((r) => r.surah === s.number)
        .map((r) => (r.footnotes ? { ayah: r.ayah, text: r.text, footnotes: r.footnotes } : { ayah: r.ayah, text: r.text })),
    };
    await write(`content/translations/${def.id}/surah/${s.number}.json`, surahFile);
  }

  const registryPath = path.join(ROOT, 'content/translations/registry.json');
  const registry = JSON.parse(await readFile(registryPath, 'utf8')) as TranslationRegistry;
  registry.translations = registry.translations.filter((t) => t.id !== def.id);
  registry.translations.push({
    id: def.id,
    language: def.language,
    direction: def.direction,
    translator: def.translator,
    name: def.name,
    source,
    license: { name: file.source.license.name, url: file.source.license.url },
    files: [{ path: file.path, sha256: file.sha256 }],
    integrity: canonicalTafsirHash(rows),
  });
  await write('content/translations/registry.json', registry);
  console.log(`Wrote content/translations/${def.id}: 114 surah files, ${rows.length} ayahs.`);
}

main().catch((err: unknown) => {
  const prefix = err instanceof SourceSurprise ? 'STOPPED — the source data contains something unexpected. Nothing was "fixed":' : 'FAILED:';
  console.error(`\n${prefix}\n  ${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
});
