// Parses and sanity-checks the approved Tanzil files. Anything unexpected throws a
// SourceSurprise: the pipeline stops and the owner decides (no silent "fixing").
import {
  checkStructure,
  comments,
  elements,
  parseQuranData,
  parseQuranXml,
  toText,
} from '../sources/lib/tanzil-xml.mjs';
import { AYAH_COUNT, HIZB_QUARTER_COUNT, JUZ_COUNT, PAGE_COUNT, SURAH_COUNT } from '../../src/lib/quran/structure.ts';
import type { ApprovedFile } from './sources.ts';

export class SourceSurprise extends Error {
  override name = 'SourceSurprise';
}

export interface TanzilAyah {
  index: number;
  text: string;
  bismillah?: string;
}

export interface TanzilSura {
  index: number;
  name: string;
  ayas: TanzilAyah[];
}

export interface TanzilText {
  suras: TanzilSura[];
  /** The XML comment block, verbatim (Tanzil's copyright notice). */
  notice: string;
  /** e.g. "Uthmani, Version 1.1" */
  version: string;
}

export interface TanzilStart {
  index: number;
  sura: number;
  aya: number;
}

export interface TanzilMetadata {
  version: string;
  copyright: string;
  license: string;
  suras: {
    index: number;
    ayas: number;
    start: number;
    name: string;
    tname: string;
    ename: string;
    type: 'Meccan' | 'Medinan';
    order: number;
    rukus: number;
  }[];
  juzs: TanzilStart[];
  quarters: TanzilStart[];
  pages: TanzilStart[];
  sajdas: (TanzilStart & { type: 'recommended' | 'obligatory' })[];
}

function stop(message: string): never {
  throw new SourceSurprise(message);
}

export function parseText(file: ApprovedFile, metadata: TanzilMetadata): TanzilText {
  const xml = toText(file.bytes);
  // entities: 'reject' (default): any '&' in a Quran string aborts instead of being decoded.
  const suras = parseQuranXml(xml) as TanzilSura[];
  const { problems } = checkStructure(suras, metadata);
  if (problems.length) stop(`${file.path}: ${problems.join('; ')}`);
  const blocks = comments(xml) as string[];
  if (blocks.length !== 1) stop(`${file.path}: expected exactly one notice comment, found ${blocks.length}`);
  const notice = blocks[0]!;
  const version = /Tanzil Quran Text \(([^)]+)\)/.exec(notice)?.[1];
  if (!version) stop(`${file.path}: notice does not state the Tanzil text version`);
  return { suras, notice, version };
}

export function parseMetadata(file: ApprovedFile): TanzilMetadata {
  const xml = toText(file.bytes);
  const root = (elements(xml, 'quran') as Record<string, string>[])[0];
  if (!root?.version || !root.copyright || !root.license) stop(`${file.path}: root element lacks version/copyright/license`);
  const data = parseQuranData(xml) as unknown as Omit<TanzilMetadata, 'version' | 'copyright' | 'license'>;
  const meta: TanzilMetadata = { version: root.version, copyright: root.copyright, license: root.license, ...data };

  const expect = (label: string, actual: number, expected: number) => {
    if (actual !== expected) stop(`${file.path}: ${label} = ${actual}, expected ${expected}`);
  };
  expect('surahs', meta.suras.length, SURAH_COUNT);
  expect('ayahs', meta.suras.reduce((n, s) => n + s.ayas, 0), AYAH_COUNT);
  expect('juz', meta.juzs.length, JUZ_COUNT);
  expect('hizb quarters', meta.quarters.length, HIZB_QUARTER_COUNT);
  expect('pages', meta.pages.length, PAGE_COUNT);
  expect('sajdahs', meta.sajdas.length, 15);

  let start = 0;
  for (const [i, s] of meta.suras.entries()) {
    if (s.index !== i + 1) stop(`${file.path}: surah #${i + 1} has index ${s.index}`);
    if (s.start !== start) stop(`${file.path}: surah ${s.index} start ${s.start}, expected ${start}`);
    if (s.type !== 'Meccan' && s.type !== 'Medinan') stop(`${file.path}: surah ${s.index} has type ${s.type}`);
    start += s.ayas;
  }
  for (const [label, list] of [
    ['juz', meta.juzs],
    ['quarter', meta.quarters],
    ['page', meta.pages],
    ['sajda', meta.sajdas],
  ] as const) {
    let previous = -1;
    for (const [i, item] of list.entries()) {
      if (item.index !== i + 1) stop(`${file.path}: ${label} #${i + 1} has index ${item.index}`);
      const surah = meta.suras[item.sura - 1];
      if (!surah || item.aya < 1 || item.aya > surah.ayas) stop(`${file.path}: ${label} ${item.index} points to ${item.sura}:${item.aya}`);
      const position = surah.start + item.aya - 1;
      if (position <= previous) stop(`${file.path}: ${label} ${item.index} is not after the previous one`);
      previous = position;
    }
    if (label !== 'sajda' && (list[0]!.sura !== 1 || list[0]!.aya !== 1)) stop(`${file.path}: first ${label} does not start at 1:1`);
  }
  for (const s of meta.sajdas) {
    if (s.type !== 'recommended' && s.type !== 'obligatory') stop(`${file.path}: sajda ${s.index} has type ${s.type}`);
  }
  return meta;
}

/**
 * Basmala rules (SPEC §2.5 + owner decision 2026-10-04):
 * - 1:1 is the Basmala of al-Fatihah (an ayah); surah 9 has none;
 * - surahs 2–114 except 9 carry it in the `bismillah` attribute, outside ayah 1 (no stripping);
 * - the attribute equals 1:1 exactly, except 95 and 97 where it is 1:1 with U+0651 after the
 *   first letter (approved: shown verbatim).
 * Anything else is a surprise for the owner.
 */
export const BASMALA_SHADDA_SURAHS: readonly number[] = [95, 97];

export function checkBasmala(text: TanzilText, label: string): void {
  const fatiha1 = text.suras[0]!.ayas[0]!.text;
  const chars = [...fatiha1];
  const shaddaVariant = chars[0] + 'ّ' + chars.slice(1).join('');
  for (const sura of text.suras) {
    const first = sura.ayas[0]!;
    const b = first.bismillah;
    if (sura.index === 1 || sura.index === 9) {
      if (b !== undefined) stop(`${label}: surah ${sura.index} unexpectedly has a bismillah attribute`);
      continue;
    }
    if (b === undefined) stop(`${label}: surah ${sura.index} has no bismillah attribute`);
    const expected = BASMALA_SHADDA_SURAHS.includes(sura.index) && label === 'display' ? shaddaVariant : fatiha1;
    if (b !== expected) stop(`${label}: the Basmala of surah ${sura.index} differs from the expected form`);
    if (first.text.startsWith(fatiha1)) stop(`${label}: ayah ${sura.index}:1 starts with the Basmala`);
  }
}
