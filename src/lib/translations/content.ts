// Server-side accessors for imported translations (SPEC §7.9).
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import type { TranslationRegistry, TranslationSurahFile } from './types.ts';

const DIR = path.join(process.cwd(), 'content', 'translations');

let registry: Promise<TranslationRegistry> | undefined;

export function getTranslationRegistry(): Promise<TranslationRegistry> {
  registry ??= readFile(path.join(DIR, 'registry.json'), 'utf8').then((s) => JSON.parse(s) as TranslationRegistry);
  return registry;
}

export async function getTranslationSurah(id: string, surah: number): Promise<TranslationSurahFile> {
  const { translations } = await getTranslationRegistry();
  if (!translations.some((t) => t.id === id)) throw new RangeError(`No translation ${id}`);
  if (!Number.isInteger(surah) || surah < 1 || surah > 114) throw new RangeError(`No surah ${surah}`);
  return JSON.parse(await readFile(path.join(DIR, id, 'surah', `${surah}.json`), 'utf8')) as TranslationSurahFile;
}
