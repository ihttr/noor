// Server-side accessors for the imported tafsirs in content/tafsir/ (SPEC §7.10).
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import type { TafsirRegistry, TafsirSurahFile } from './types.ts';

const DIR = path.join(process.cwd(), 'content', 'tafsir');

let registry: Promise<TafsirRegistry> | undefined;

export function getTafsirRegistry(): Promise<TafsirRegistry> {
  registry ??= readFile(path.join(DIR, 'registry.json'), 'utf8').then((s) => JSON.parse(s) as TafsirRegistry);
  return registry;
}

export async function getTafsirSurah(id: string, surah: number): Promise<TafsirSurahFile> {
  const { tafsirs } = await getTafsirRegistry();
  if (!tafsirs.some((t) => t.id === id)) throw new RangeError(`No tafsir ${id}`);
  if (!Number.isInteger(surah) || surah < 1 || surah > 114) throw new RangeError(`No surah ${surah}`);
  return JSON.parse(await readFile(path.join(DIR, id, 'surah', `${surah}.json`), 'utf8')) as TafsirSurahFile;
}
