// Adhkar integrity: the committed content equals a fresh build from the approved dataset (verbatim
// texts, references present, Quran mappings still matching). Used by verify-content and Vitest.
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import type { Check } from '../quran/verify.ts';
import { ROOT, loadApproved } from '../quran/sources.ts';
import { buildAdhkar, type QuranMapping } from './build.ts';
import type { SearchIndexFile } from '../../src/lib/quran/types.ts';
import type { AdhkarCategoryFile, AdhkarIndex } from '../../src/lib/adhkar/types.ts';

const readJson = async <T>(file: string): Promise<T> => JSON.parse(await readFile(file, 'utf8')) as T;

export async function verifyAdhkar({ contentDir = path.join(ROOT, 'content') } = {}): Promise<Check[]> {
  const [ar, en] = [await loadApproved('adhkar-seen-arabic-ar'), await loadApproved('adhkar-seen-arabic-en')];
  const mapping = await readJson<QuranMapping>(path.join(ROOT, 'data/curated/adhkar-quran.json'));
  const search = await readJson<SearchIndexFile>(path.join(contentDir, 'search/index.json'));
  const fresh = buildAdhkar(ar, en, mapping, search);
  const index = await readJson<AdhkarIndex>(path.join(contentDir, 'adhkar/index.json'));
  const checks: Check[] = [
    { id: 'adhkar-index', ok: JSON.stringify(index) === JSON.stringify(fresh.index), detail: 'content/adhkar/index.json equals a fresh build' },
  ];
  let differ = 0;
  let items = 0;
  let missingRef = 0;
  for (const c of fresh.categories) {
    const file = await readJson<AdhkarCategoryFile>(path.join(contentDir, `adhkar/${c.id}.json`));
    if (JSON.stringify(file) !== JSON.stringify(c)) differ++;
    items += file.items.length;
    missingRef += file.items.filter((d) => !d.reference.ar || !d.reference.en).length;
  }
  checks.push({
    id: 'adhkar-text',
    ok: differ === 0,
    detail: `${items} adhkar in ${fresh.categories.length} categories; ${differ} file(s) differ from the dataset (exact)`,
  });
  checks.push({ id: 'adhkar-references', ok: missingRef === 0, detail: `${missingRef} dhikr(s) without a reference (SPEC §2.7)` });
  return checks;
}
