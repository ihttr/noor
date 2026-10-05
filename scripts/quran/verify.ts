// Content integrity checks (SPEC §2.6, except the DOM rendering test of Phase 3).
// Compares the committed content/ files with the approved sources, re-parsed from scratch.
// Used by `node scripts/verify-content.ts` and by the Vitest suite (CI-blocking).
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { NORMALIZATION_VERSION, normalizeArabic } from '../../src/lib/quran/normalize.ts';
import { ayahKey, divisionAt } from '../../src/lib/quran/structure.ts';
import type { QuranMeta, SearchIndexFile, SurahFile } from '../../src/lib/quran/types.ts';
import { canonicalAyahHash, canonicalBismillahHash, parseSources } from './build.ts';
import { ROOT, loadAllApproved } from './sources.ts';

export interface Check {
  id: string;
  ok: boolean;
  detail: string;
}

const readJson = async <T>(file: string): Promise<T> => JSON.parse(await readFile(file, 'utf8')) as T;

/** Files in the Quran data path; none may call String.prototype.normalize — see CLAUDE.md. */
export const QURAN_DATA_PATH = ['scripts/import-quran.ts', 'scripts/verify-content.ts', 'scripts/quran', 'src/lib/quran'];

async function listFiles(p: string): Promise<string[]> {
  const abs = path.join(ROOT, p);
  if (p.endsWith('.ts')) return [abs];
  const entries = await readdir(abs, { withFileTypes: true, recursive: true });
  return entries.filter((e) => e.isFile() && /\.(ts|tsx|mjs|js)$/.test(e.name)).map((e) => path.join(e.parentPath, e.name));
}

/** `contentDir` defaults to <repo>/content; tests point it at a tampered copy. */
export async function verifyContent({ contentDir = path.join(ROOT, 'content') } = {}): Promise<Check[]> {
  const checks: Check[] = [];
  const contentFile = (p: string) => path.join(contentDir, p);
  const check = (id: string, ok: boolean, detail: string) => checks.push({ id, ok, detail });

  // 1. Approved sources (throws on a SHA-256 mismatch → reported as a failed check)
  let files: Awaited<ReturnType<typeof loadAllApproved>>;
  try {
    files = await loadAllApproved();
    check('sources', true, Object.values(files).map((f) => `${f.use}: ${f.path}`).join('; '));
  } catch (err) {
    check('sources', false, err instanceof Error ? err.message : String(err));
    return checks;
  }
  const { display, search, metadata } = parseSources(files);
  const sourceAyahs = display.suras.flatMap((s) => s.ayas.map((a) => ({ surah: s.index, ayah: a.index, text: a.text })));

  // 2. Counts
  const meta = await readJson<QuranMeta>(contentFile('quran/meta.json'));
  const countsOk =
    meta.counts.surahs === 114 &&
    meta.counts.ayahs === 6236 &&
    meta.counts.pages === 604 &&
    meta.counts.juz === 30 &&
    meta.counts.hizbs === 60 &&
    meta.counts.hizbQuarters === 240 &&
    meta.counts.sajdahs === 15 &&
    meta.surahs.length === 114 &&
    meta.surahs.reduce((n, s) => n + s.ayahCount, 0) === 6236 &&
    meta.surahs.every((s, i) => s.number === i + 1 && s.ayahCount === metadata.suras[i]!.ayas);
  check('counts', countsOk, `${JSON.stringify(meta.counts)}; per-surah ayah counts vs Tanzil metadata`);

  // 3. Surah files: one per surah, ayah count matches the metadata, numbers 1..n
  const surahFiles: SurahFile[] = [];
  const listed = (await readdir(contentFile('quran/surah'))).filter((f) => f.endsWith('.json'));
  for (let n = 1; n <= 114; n++) surahFiles.push(await readJson<SurahFile>(contentFile(`quran/surah/${n}.json`)));
  const shapeProblems = surahFiles.flatMap((f, i) => {
    const expected = meta.surahs[i]!.ayahCount;
    const bad: string[] = [];
    if (f.surah !== i + 1) bad.push(`file ${i + 1} says surah ${f.surah}`);
    if (f.ayahs.length !== expected) bad.push(`surah ${i + 1}: ${f.ayahs.length} ayahs, metadata ${expected}`);
    if (f.ayahs.some((a, j) => a.number !== j + 1)) bad.push(`surah ${i + 1}: ayah numbers not 1..n`);
    return bad;
  });
  const generatedAyahs = surahFiles.flatMap((f) => f.ayahs.map((a) => ({ surah: f.surah, ayah: a.number, text: a.text })));
  check(
    'surah-files',
    listed.length === 114 && shapeProblems.length === 0 && generatedAyahs.length === 6236,
    `${listed.length} files, ${generatedAyahs.length} ayahs${shapeProblems.length ? `; ${shapeProblems.slice(0, 3).join('; ')}` : ''}`
  );

  // 4. Exact code-point equality with the source
  const mismatches = generatedAyahs.filter((a, i) => {
    const s = sourceAyahs[i];
    return !s || s.surah !== a.surah || s.ayah !== a.ayah || s.text !== a.text;
  });
  check(
    'exact-text',
    mismatches.length === 0 && sourceAyahs.length === generatedAyahs.length,
    mismatches.length
      ? `${mismatches.length} ayahs differ, e.g. ${mismatches.slice(0, 3).map((m) => ayahKey(m)).join(', ')}`
      : `all ${generatedAyahs.length} ayah strings equal the source, code point for code point`
  );

  // 5. SHA-256 over the canonical concatenation = value recorded at import = source
  const generatedHash = canonicalAyahHash(generatedAyahs);
  const sourceHash = canonicalAyahHash(sourceAyahs);
  check(
    'integrity-hash',
    generatedHash === meta.integrity.ayahs && sourceHash === meta.integrity.ayahs,
    `recorded ${meta.integrity.ayahs.slice(0, 16)}…, content ${generatedHash.slice(0, 16)}…, source ${sourceHash.slice(0, 16)}…`
  );

  // 6. Basmala (SPEC §2.5 + approved 95/97 variant, verbatim from the source attribute)
  const fatiha1 = display.suras[0]!.ayas[0]!.text;
  const basmalaProblems = surahFiles.flatMap((f, i) => {
    const sourceAttr = display.suras[i]!.ayas[0]!.bismillah ?? null;
    const bad: string[] = [];
    if (f.bismillah !== sourceAttr) bad.push(`surah ${f.surah}: header differs from the source attribute`);
    if ((f.surah === 1 || f.surah === 9) !== (f.bismillah === null)) bad.push(`surah ${f.surah}: header presence`);
    if (meta.surahs[i]!.hasBismillah !== (f.bismillah !== null)) bad.push(`surah ${f.surah}: hasBismillah flag`);
    if (f.surah > 1 && f.ayahs[0]!.text.startsWith(fatiha1)) bad.push(`surah ${f.surah}: ayah 1 starts with the Basmala`);
    return bad;
  });
  const bismillahHash = canonicalBismillahHash(
    surahFiles.flatMap((f) => (f.bismillah === null ? [] : [{ surah: f.surah, bismillah: f.bismillah }]))
  );
  const headers = surahFiles.filter((f) => f.bismillah !== null);
  check(
    'basmala',
    basmalaProblems.length === 0 && bismillahHash === meta.integrity.bismillah && headers.length === 112,
    basmalaProblems.length
      ? basmalaProblems.slice(0, 3).join('; ')
      : `1:1 is an ayah of al-Fatihah; 112 header lines verbatim from the source (none for 1 and 9); ` +
          `variants: ${headers.filter((f) => f.bismillah !== headers[0]!.bismillah).map((f) => f.surah).join(', ') || 'none'}`
  );

  // 7. Per-ayah structure recomputed from the Tanzil metadata
  const starts = {
    pages: metadata.pages.map((p) => ({ start: { surah: p.sura, ayah: p.aya } })),
    juz: metadata.juzs.map((j) => ({ start: { surah: j.sura, ayah: j.aya } })),
    quarters: metadata.quarters.map((q) => ({ start: { surah: q.sura, ayah: q.aya } })),
  };
  const structure = { surahs: metadata.suras.map((s) => ({ number: s.index, ayahCount: s.ayas, startIndex: s.start })) };
  const sajdahs = new Map(metadata.sajdas.map((s) => [`${s.sura}:${s.aya}`, s.type]));
  const structureProblems: string[] = [];
  const seen = { pages: new Set<number>(), juz: new Set<number>(), quarters: new Set<number>() };
  let index = 0;
  for (const f of surahFiles) {
    for (const a of f.ayahs) {
      const page = divisionAt(structure, starts.pages, index);
      const juz = divisionAt(structure, starts.juz, index);
      const quarter = divisionAt(structure, starts.quarters, index);
      const sajdah = sajdahs.get(`${f.surah}:${a.number}`);
      if (a.page !== page || a.juz !== juz || a.hizbQuarter !== quarter || a.hizb !== Math.ceil(quarter / 4) || a.sajdah !== sajdah) {
        structureProblems.push(`${f.surah}:${a.number}`);
      }
      seen.pages.add(a.page);
      seen.juz.add(a.juz);
      seen.quarters.add(a.hizbQuarter);
      index++;
    }
  }
  const flagged = surahFiles.flatMap((f) => f.ayahs.filter((a) => a.sajdah)).length;
  check(
    'structure',
    structureProblems.length === 0 &&
      seen.pages.size === 604 &&
      seen.juz.size === 30 &&
      seen.quarters.size === 240 &&
      flagged === 15 &&
      meta.surahs.every((s, i) => s.firstPage === surahFiles[i]!.ayahs[0]!.page && s.lastPage === surahFiles[i]!.ayahs.at(-1)!.page),
    structureProblems.length
      ? `${structureProblems.length} ayahs with wrong page/juz/hizb/sajdah, e.g. ${structureProblems.slice(0, 3).join(', ')}`
      : `page/juz/hizb/quarter of every ayah match the metadata; ${seen.pages.size} pages, ${seen.juz.size} juz, ${seen.quarters.size} quarters, ${flagged} sajdahs`
  );

  // 8. Source notice travels with every generated file (D-012)
  const index_ = await readJson<SearchIndexFile>(contentFile('search/index.json'));
  const noticeOk =
    meta.text.notice === display.notice &&
    surahFiles.every((f) => f.source.notice === display.notice && f.source.files[0]?.sha256 === files['quran-display'].sha256) &&
    index_.source.notice === search.notice;
  check('notice', noticeOk, 'Tanzil notice + source file hash present in meta.json, all 114 surah files and the search index');

  // 9. Search index: Simple Clean, normalized per SPEC §7.8, nothing else
  const cleanAyahs = search.suras.flatMap((s) => s.ayas.map((a) => ({ key: `${s.index}:${a.index}`, text: a.text })));
  const forbidden = /[ؐ-ًؚ-ٰٟۖ-ۭـأإآٱةىؤئ]/u;
  const indexProblems = index_.entries.filter(([key, text], i) => {
    const src = cleanAyahs[i];
    return !src || src.key !== key || text !== normalizeArabic(src.text) || forbidden.test(text);
  });
  check(
    'search-index',
    index_.entries.length === 6236 && indexProblems.length === 0 && index_.normalization.version === NORMALIZATION_VERSION,
    indexProblems.length
      ? `${indexProblems.length} entries differ, e.g. ${indexProblems.slice(0, 3).map(([k]) => k).join(', ')}`
      : `${index_.entries.length} entries = normalized Simple Clean text (rules v${index_.normalization.version})`
  );

  // 10. No Unicode normalization anywhere in the Quran data path
  const callPattern = new RegExp(`\\.${'normalize'}\\s*\\(`);
  const offenders: string[] = [];
  for (const p of QURAN_DATA_PATH) {
    for (const file of await listFiles(p)) {
      if (callPattern.test(await readFile(file, 'utf8'))) offenders.push(path.relative(ROOT, file));
    }
  }
  check('no-unicode-normalize', offenders.length === 0, offenders.length ? offenders.join(', ') : `no String.prototype.normalize call in ${QURAN_DATA_PATH.join(', ')}`);

  return checks;
}
