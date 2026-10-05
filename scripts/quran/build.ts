// Builds the content/ files from the parsed, approved Tanzil sources. Quran strings are copied
// by reference from the parsed source objects — never edited, trimmed or normalized here.
import { NORMALIZATION_RULES, NORMALIZATION_VERSION, normalizeArabic } from '../../src/lib/quran/normalize.ts';
import { HIZB_COUNT, ayahKey, divisionAt } from '../../src/lib/quran/structure.ts';
import type {
  Ayah,
  AyahKey,
  ContentSource,
  QuranMeta,
  SearchIndexFile,
  SurahFile,
  SurahMeta,
} from '../../src/lib/quran/types.ts';
import { SourceSurprise, checkBasmala, parseMetadata, parseText, type TanzilMetadata, type TanzilText } from './parse.ts';
import { sha256, type ApprovedFile, type QuranUse } from './sources.ts';

export const CANONICAL_FORM = 'For every ayah in Mushaf order: `${surah}|${ayah}|${text}\\n`, UTF-8, SHA-256.';

export function canonicalAyahHash(ayahs: Iterable<{ surah: number; ayah: number; text: string }>): string {
  let s = '';
  for (const a of ayahs) s += `${a.surah}|${a.ayah}|${a.text}\n`;
  return sha256(s);
}

export function canonicalBismillahHash(entries: Iterable<{ surah: number; bismillah: string }>): string {
  let s = '';
  for (const e of entries) s += `${e.surah}|${e.bismillah}\n`;
  return sha256(s);
}

export interface ParsedSources {
  display: TanzilText;
  search: TanzilText;
  metadata: TanzilMetadata;
}

export function parseSources(files: Record<QuranUse, ApprovedFile>): ParsedSources {
  const metadata = parseMetadata(files['quran-metadata']);
  const display = parseText(files['quran-display'], metadata);
  const search = parseText(files['quran-search'], metadata);
  checkBasmala(display, 'display');
  checkBasmala(search, 'search');
  const marked = search.suras.flatMap((s) => s.ayas).filter((a) => /[ۖ-ۭ]/u.test(a.text)).length;
  if (marked) throw new SourceSurprise(`search text: ${marked} ayahs contain pause/annotation marks`);
  return { display, search, metadata };
}

/** Structure meta without the per-surah page fields (filled in once pages are known). */
function structureOf(md: TanzilMetadata): Pick<QuranMeta, 'surahs' | 'juz' | 'hizbQuarters' | 'pages' | 'sajdahs'> {
  return {
    surahs: md.suras.map((s) => ({
      number: s.index,
      ayahCount: s.ayas,
      startIndex: s.start,
      name: s.name,
      transliteration: s.tname,
      englishName: s.ename,
      revelationType: s.type,
      revelationOrder: s.order,
      rukus: s.rukus,
      hasBismillah: s.index !== 1 && s.index !== 9,
      firstPage: 0,
      lastPage: 0,
    })),
    juz: md.juzs.map((j) => ({ number: j.index, start: { surah: j.sura, ayah: j.aya } })),
    hizbQuarters: md.quarters.map((q) => ({
      number: q.index,
      hizb: Math.ceil(q.index / 4),
      quarter: ((q.index - 1) % 4) + 1,
      start: { surah: q.sura, ayah: q.aya },
    })),
    pages: md.pages.map((p) => ({ number: p.index, start: { surah: p.sura, ayah: p.aya } })),
    sajdahs: md.sajdas.map((s) => ({ number: s.index, surah: s.sura, ayah: s.aya, type: s.type })),
  };
}

function sourceBlock(file: ApprovedFile, name: string, url: string, version: string, license: string, notice: string): ContentSource {
  return { name, url, version, license, notice, files: [{ path: file.path, sha256: file.sha256 }] };
}

export interface BuiltContent {
  meta: QuranMeta;
  surahs: SurahFile[];
  searchIndex: SearchIndexFile;
}

export function buildContent(files: Record<QuranUse, ApprovedFile>, parsed = parseSources(files)): BuiltContent {
  const { display, search, metadata } = parsed;
  const structure = structureOf(metadata);

  const text = sourceBlock(
    files['quran-display'],
    'Tanzil Quran Text',
    'https://tanzil.net',
    display.version,
    files['quran-display'].source.license.name,
    display.notice
  );
  const metadataSource = sourceBlock(
    files['quran-metadata'],
    'Tanzil Quran Metadata',
    'https://tanzil.net/docs/quran_metadata',
    metadata.version,
    metadata.license,
    `copyright="${metadata.copyright}" license="${metadata.license}"`
  );

  const sajdahAt = new Map(structure.sajdahs.map((s) => [ayahKey(s), s.type]));
  const surahs: SurahFile[] = display.suras.map((sura) => {
    const meta = structure.surahs[sura.index - 1]!;
    const ayahs: Ayah[] = sura.ayas.map((a) => {
      const index = meta.startIndex + a.index - 1;
      const hizbQuarter = divisionAt(structure, structure.hizbQuarters, index);
      const sajdah = sajdahAt.get(`${sura.index}:${a.index}` as AyahKey);
      return {
        number: a.index,
        text: a.text,
        page: divisionAt(structure, structure.pages, index),
        juz: divisionAt(structure, structure.juz, index),
        hizb: Math.ceil(hizbQuarter / 4),
        hizbQuarter,
        ...(sajdah ? { sajdah } : {}),
      };
    });
    (meta as SurahMeta).firstPage = ayahs[0]!.page;
    (meta as SurahMeta).lastPage = ayahs[ayahs.length - 1]!.page;
    return {
      schemaVersion: 1,
      surah: sura.index,
      source: text,
      bismillah: sura.ayas[0]!.bismillah ?? null,
      ayahs,
    };
  });

  const meta: QuranMeta = {
    schemaVersion: 1,
    text,
    metadata: metadataSource,
    counts: {
      surahs: structure.surahs.length,
      ayahs: structure.surahs.reduce((n, s) => n + s.ayahCount, 0),
      pages: structure.pages.length,
      juz: structure.juz.length,
      hizbs: HIZB_COUNT,
      hizbQuarters: structure.hizbQuarters.length,
      sajdahs: structure.sajdahs.length,
    },
    integrity: {
      algorithm: 'sha256',
      canonicalForm: CANONICAL_FORM,
      ayahs: canonicalAyahHash(surahs.flatMap((s) => s.ayahs.map((a) => ({ surah: s.surah, ayah: a.number, text: a.text })))),
      bismillah: canonicalBismillahHash(
        surahs.flatMap((s) => (s.bismillah === null ? [] : [{ surah: s.surah, bismillah: s.bismillah }]))
      ),
    },
    ...structure,
  };

  const searchIndex: SearchIndexFile = {
    schemaVersion: 1,
    purpose: 'Normalized Simple Clean text for search matching only. Never display it as Quran.',
    source: sourceBlock(
      files['quran-search'],
      'Tanzil Quran Text',
      'https://tanzil.net',
      search.version,
      files['quran-search'].source.license.name,
      search.notice
    ),
    normalization: { version: NORMALIZATION_VERSION, rules: [...NORMALIZATION_RULES] },
    entries: search.suras.flatMap((s) =>
      s.ayas.map((a) => [`${s.index}:${a.index}` as AyahKey, normalizeArabic(a.text)] as [AyahKey, string])
    ),
  };

  return { meta, surahs, searchIndex };
}
