// Tafsir integrity: every generated entry equals the approved source text exactly, every ayah is
// covered once, and the registry hash matches. Used by `node scripts/verify-content.ts` and Vitest.
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import type { Check } from '../quran/verify.ts';
import { ROOT, loadApproved } from '../quran/sources.ts';
import { TAFSIRS, canonicalTafsirHash, checkCoverage } from './build.ts';
import type { QuranMeta } from '../../src/lib/quran/types.ts';
import type { TafsirRegistry, TafsirSurahFile } from '../../src/lib/tafsir/types.ts';

const readJson = async <T>(file: string): Promise<T> => JSON.parse(await readFile(file, 'utf8')) as T;

export async function verifyTafsir({ contentDir = path.join(ROOT, 'content') } = {}): Promise<Check[]> {
  const checks: Check[] = [];
  const meta = await readJson<QuranMeta>(path.join(contentDir, 'quran/meta.json'));
  const registry = await readJson<TafsirRegistry>(path.join(contentDir, 'tafsir/registry.json'));
  const ids = registry.tafsirs.map((t) => t.id).sort();
  const approved = Object.keys(TAFSIRS).sort();
  checks.push({
    id: 'tafsir-registry',
    ok: JSON.stringify(ids) === JSON.stringify(approved),
    detail: `registry: ${ids.join(', ') || '(empty)'}; approved: ${approved.join(', ')}`,
  });

  for (const entry of registry.tafsirs) {
    const def = TAFSIRS[entry.id];
    if (!def) continue;
    const file = await loadApproved(def.use);
    const rows = def.read(file);
    checkCoverage(rows, meta.surahs.map((s) => s.ayahCount), entry.id);

    let mismatches = 0;
    let count = 0;
    const generated: { surah: number; ayah: number; text: string }[] = [];
    for (const s of meta.surahs) {
      const surahFile = await readJson<TafsirSurahFile>(path.join(contentDir, `tafsir/${entry.id}/surah/${s.number}.json`));
      for (const e of surahFile.entries) {
        const src = rows[s.startIndex + e.ayah - 1];
        count++;
        generated.push({ surah: s.number, ayah: e.ayah, text: e.text });
        if (!src || src.surah !== s.number || src.ayah !== e.ayah || src.text !== e.text || (src.footnotes || undefined) !== e.footnotes) mismatches++;
      }
      if (surahFile.source.files[0]?.sha256 !== file.sha256) mismatches++;
    }
    checks.push({
      id: `tafsir-${entry.id}-text`,
      ok: mismatches === 0 && count === rows.length,
      detail: `${count} entries, ${mismatches} differ from ${file.path} (exact code-point comparison)`,
    });
    const hash = canonicalTafsirHash(generated);
    checks.push({
      id: `tafsir-${entry.id}-hash`,
      ok: hash === entry.integrity && hash === canonicalTafsirHash(rows),
      detail: `SHA-256 ${hash.slice(0, 16)}… ${hash === entry.integrity ? 'matches' : 'differs from'} the registry`,
    });
  }
  return checks;
}
