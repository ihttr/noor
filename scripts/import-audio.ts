// Generates content/audio/reciters.json from the owner-approved Islamic Network edition list
// (D-021, D-054) and the probed bitrates in data/curated/audio-bitrates.json.
//
// Usage (PowerShell or any shell):  node scripts/import-audio.ts
//
// Only Arabic recitations are listed (spoken translations are not recitations). The "-2"
// editions repeat a reciter of the main list under the same name and are left out to avoid
// two identical entries. Bitrate: 128 kbps when available, else 64, else the first available.
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { stringifyContent } from './quran/json.ts';
import { SourceSurprise } from './quran/parse.ts';
import { ROOT, loadApproved } from './quran/sources.ts';
import type { Reciter, ReciterList } from '../src/lib/audio/types.ts';

interface Edition {
  identifier: string;
  language: string;
  name: string;
  englishName: string;
  format: string;
  type: string;
}

const DEFAULT_RECITER = 'ar.alafasy';

async function main(): Promise<void> {
  const file = await loadApproved('audio-islamic-network');
  console.log(`✓ audio-islamic-network: ${file.path} (SHA-256 verified)`);
  const editions = (JSON.parse(file.bytes.toString('utf8')) as { data: Edition[] }).data;
  const probe = JSON.parse(await readFile(path.join(ROOT, 'data/curated/audio-bitrates.json'), 'utf8')) as {
    probedAt: string;
    bitrates: Record<string, number[]>;
  };

  const reciters: Reciter[] = [];
  for (const e of editions) {
    if (e.format !== 'audio' || e.type !== 'versebyverse') throw new SourceSurprise(`Unexpected edition ${e.identifier}`);
    if (e.language !== 'ar' || /-\d+$/.test(e.identifier)) continue;
    const available = probe.bitrates[e.identifier];
    if (!available?.length) throw new SourceSurprise(`No probed bitrate for ${e.identifier}; re-run the probe`);
    const bitrate = available.includes(128) ? 128 : available.includes(64) ? 64 : available[0]!;
    reciters.push({ id: e.identifier, name: { ar: e.name, en: e.englishName.trim() }, bitrate });
  }
  if (!reciters.some((r) => r.id === DEFAULT_RECITER)) throw new SourceSurprise(`Default reciter ${DEFAULT_RECITER} missing`);

  const list: ReciterList = {
    schemaVersion: 1,
    source: {
      name: 'Islamic Network (alquran.cloud)',
      url: 'https://alquran.cloud',
      terms: 'https://alquran.cloud/terms-and-conditions',
      urlTemplate: 'https://cdn.islamic.network/quran/audio/{bitrate}/{id}/{ayah}.mp3',
      files: [{ path: file.path, sha256: file.sha256 }],
      bitratesProbedAt: probe.probedAt,
    },
    defaultReciter: DEFAULT_RECITER,
    reciters,
  };
  const out = path.join(ROOT, 'content/audio/reciters.json');
  await mkdir(path.dirname(out), { recursive: true });
  await writeFile(out, `${stringifyContent(list)}\n`, 'utf8');
  console.log(`Wrote content/audio/reciters.json: ${reciters.length} reciters (default ${DEFAULT_RECITER}).`);
}

main().catch((err: unknown) => {
  const prefix = err instanceof SourceSurprise ? 'STOPPED — the source data contains something unexpected:' : 'FAILED:';
  console.error(`\n${prefix}\n  ${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
});
