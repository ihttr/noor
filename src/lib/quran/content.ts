// Typed, cached accessors for the generated Quran content in content/ (server side and scripts).
// The data is static and committed; nothing here modifies a Quran string.
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import {
  ayahIndex,
  ayahKey,
  hizbQuarterRange,
  juzRange,
  pageRange,
  refAtIndex,
  type AyahRange,
} from './structure.ts';
import type { AyahWithRef, QuranMeta, SearchIndexFile, SurahFile } from './types.ts';

export const CONTENT_DIR = path.join(process.cwd(), 'content');

async function readJson<T>(relativePath: string): Promise<T> {
  return JSON.parse(await readFile(path.join(CONTENT_DIR, relativePath), 'utf8')) as T;
}

let metaPromise: Promise<QuranMeta> | undefined;
const surahPromises = new Map<number, Promise<SurahFile>>();

export function getMeta(): Promise<QuranMeta> {
  metaPromise ??= readJson<QuranMeta>('quran/meta.json');
  return metaPromise;
}

export function getSurah(surah: number): Promise<SurahFile> {
  if (!Number.isInteger(surah) || surah < 1 || surah > 114) {
    return Promise.reject(new RangeError(`No surah ${surah}`));
  }
  let promise = surahPromises.get(surah);
  if (!promise) {
    promise = readJson<SurahFile>(`quran/surah/${surah}.json`);
    surahPromises.set(surah, promise);
  }
  return promise;
}

export function getSearchIndex(): Promise<SearchIndexFile> {
  return readJson<SearchIndexFile>('search/index.json');
}

/** All ayahs of a range, in Mushaf order, with their surah and key. */
export async function getAyahsInRange(range: AyahRange): Promise<AyahWithRef[]> {
  const meta = await getMeta();
  const first = ayahIndex(meta, range.start);
  const last = ayahIndex(meta, range.end);
  const out: AyahWithRef[] = [];
  for (let surah = range.start.surah; surah <= range.end.surah; surah++) {
    const file = await getSurah(surah);
    for (const ayah of file.ayahs) {
      const index = ayahIndex(meta, { surah, ayah: ayah.number });
      if (index >= first && index <= last) out.push({ ...ayah, surah, key: ayahKey({ surah, ayah: ayah.number }) });
    }
  }
  return out;
}

export interface Division extends AyahRange {
  number: number;
  ayahs: AyahWithRef[];
}

async function division(rangeOf: (meta: QuranMeta, n: number) => AyahRange, n: number): Promise<Division> {
  const range = rangeOf(await getMeta(), n);
  return { number: n, ...range, ayahs: await getAyahsInRange(range) };
}

/** Madani page 1–604 (page boundaries follow the Madani Mushaf; line layout is not modelled). */
export const getPage = (page: number) => division(pageRange, page);
export const getJuz = (juz: number) => division(juzRange, juz);
/** Hizb quarter 1–240. */
export const getHizbQuarter = (quarter: number) => division(hizbQuarterRange, quarter);

export async function getAyah(surah: number, ayah: number): Promise<AyahWithRef | undefined> {
  const meta = await getMeta();
  const index = ayahIndex(meta, { surah, ayah });
  const ref = refAtIndex(meta, index);
  const found = (await getSurah(ref.surah)).ayahs[ref.ayah - 1];
  return found && { ...found, surah: ref.surah, key: ayahKey(ref) };
}
