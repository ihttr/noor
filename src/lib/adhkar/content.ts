// Server-side accessors for content/adhkar/ (SPEC §7.14).
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { ADHKAR_CATEGORIES, type AdhkarCategory, type AdhkarCategoryFile, type AdhkarIndex } from './types.ts';

const DIR = path.join(process.cwd(), 'content', 'adhkar');

let index: Promise<AdhkarIndex> | undefined;

export function getAdhkarIndex(): Promise<AdhkarIndex> {
  index ??= readFile(path.join(DIR, 'index.json'), 'utf8').then((s) => JSON.parse(s) as AdhkarIndex);
  return index;
}

export const isAdhkarCategory = (value: string): value is AdhkarCategory => (ADHKAR_CATEGORIES as readonly string[]).includes(value);

/** A category's adhkar, or null when no approved source covers it yet. */
export async function getAdhkarCategory(id: AdhkarCategory): Promise<AdhkarCategoryFile | null> {
  const { categories } = await getAdhkarIndex();
  if (!categories.find((c) => c.id === id)?.count) return null;
  return JSON.parse(await readFile(path.join(DIR, `${id}.json`), 'utf8')) as AdhkarCategoryFile;
}
