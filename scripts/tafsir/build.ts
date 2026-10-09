// Builds content/tafsir/{id}/surah/{n}.json from an approved source file. Texts are copied
// verbatim (no trimming, normalization or replacement); anything unexpected stops the import.
import { DatabaseSync } from 'node:sqlite';
import path from 'node:path';
import { SourceSurprise } from '../quran/parse.ts';
import { ROOT, sha256, type ApprovedFile } from '../quran/sources.ts';
import type { TafsirEntry, TafsirRegistryEntry, TafsirSource, TafsirSurahFile } from '../../src/lib/tafsir/types.ts';

export interface TafsirRow {
  surah: number;
  ayah: number;
  text: string;
  footnotes: string;
}

/** Reads the QuranEnc SQLite layout (table `translations`: sura, aya, translation, footnotes). */
export function readQuranEncSqlite(file: ApprovedFile): TafsirRow[] {
  const db = new DatabaseSync(path.join(ROOT, file.path), { readOnly: true });
  try {
    const rows = db.prepare('SELECT sura, aya, translation, footnotes FROM translations ORDER BY sura, aya').all() as {
      sura: unknown;
      aya: unknown;
      translation: unknown;
      footnotes: unknown;
    }[];
    return rows.map((r) => {
      if (!Number.isInteger(r.sura) || !Number.isInteger(r.aya)) throw new SourceSurprise(`Non-integer sura/aya in ${file.path}`);
      if (typeof r.translation !== 'string' || r.translation.length === 0) {
        throw new SourceSurprise(`Empty text for ${String(r.sura)}:${String(r.aya)} in ${file.path}`);
      }
      if (r.footnotes !== null && typeof r.footnotes !== 'string') throw new SourceSurprise(`Unexpected footnotes type in ${file.path}`);
      return { surah: r.sura as number, ayah: r.aya as number, text: r.translation, footnotes: (r.footnotes as string | null) ?? '' };
    });
  } finally {
    db.close();
  }
}

export function canonicalTafsirHash(rows: readonly { surah: number; ayah: number; text: string }[]): string {
  return sha256(rows.map((r) => `${r.surah}|${r.ayah}|${r.text}\n`).join(''));
}

/** Checks that the rows cover every ayah exactly once, given the ayah count of each surah. */
export function checkCoverage(rows: readonly TafsirRow[], ayahCounts: readonly number[], what: string): void {
  const expected = ayahCounts.reduce((a, b) => a + b, 0);
  if (rows.length !== expected) throw new SourceSurprise(`${what}: ${rows.length} entries, expected ${expected}`);
  let i = 0;
  for (const [s, count] of ayahCounts.entries()) {
    for (let a = 1; a <= count; a++, i++) {
      const r = rows[i]!;
      if (r.surah !== s + 1 || r.ayah !== a) throw new SourceSurprise(`${what}: entry ${i} is ${r.surah}:${r.ayah}, expected ${s + 1}:${a}`);
    }
  }
}

export interface TafsirDefinition {
  id: string;
  language: 'ar' | 'en';
  name: { ar: string; en: string };
  author: { ar: string; en: string };
  distribution: { name: string; url: string };
}

/** Approved tafsirs (DECISIONS D-049). Display names come from the source's own attribution. */
export const TAFSIRS: Record<string, TafsirDefinition & { use: 'tafsir-muyassar'; read: (f: ApprovedFile) => TafsirRow[] }> = {
  muyassar: {
    id: 'muyassar',
    use: 'tafsir-muyassar',
    language: 'ar',
    name: { ar: 'التفسير الميسر', en: 'Tafsir al-Muyassar' },
    author: { ar: 'مجمع الملك فهد لطباعة المصحف الشريف', en: 'King Fahd Glorious Quran Printing Complex' },
    distribution: { name: 'QuranEnc.com', url: 'https://quranenc.com/ar/browse/arabic_moyassar' },
    read: readQuranEncSqlite,
  },
};

export function buildTafsir(
  def: TafsirDefinition,
  file: ApprovedFile,
  rows: readonly TafsirRow[],
  ayahCounts: readonly number[]
): { registry: TafsirRegistryEntry; surahs: TafsirSurahFile[] } {
  checkCoverage(rows, ayahCounts, def.id);
  const downloadedAt = file.entry.downloadedAt;
  if (!downloadedAt) throw new SourceSurprise(`${file.path} has no download date in the lock`);
  const source: TafsirSource = {
    name: def.name,
    author: def.author,
    distribution: def.distribution,
    version: /not published/i.test(file.source.version) ? null : file.source.version,
    downloadedAt: downloadedAt.slice(0, 10),
    license: { name: file.source.license.name, url: file.source.license.url },
    files: [{ path: file.path, sha256: file.sha256 }],
  };
  const surahs: TafsirSurahFile[] = ayahCounts.map((_, i) => ({
    schemaVersion: 1,
    id: def.id,
    surah: i + 1,
    source,
    entries: rows
      .filter((r) => r.surah === i + 1)
      .map((r): TafsirEntry => (r.footnotes ? { ayah: r.ayah, text: r.text, footnotes: r.footnotes } : { ayah: r.ayah, text: r.text })),
  }));
  return {
    registry: {
      id: def.id,
      language: def.language,
      direction: def.language === 'ar' ? 'rtl' : 'ltr',
      source,
      integrity: canonicalTafsirHash(rows),
      entries: rows.length,
    },
    surahs,
  };
}
