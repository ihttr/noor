// Creates data/curated/surah-slugs.json from the Tanzil transliterations (owner decision
// 2026-10-05, D-037). The file is then curated by hand; this script never overwrites it unless
// --force is given. Slugs are URL labels, not Quran text.
//
// Usage:  node scripts/init-surah-slugs.ts [--force]
import { access, mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { QuranMeta } from '../src/lib/quran/types.ts';
import { ROOT } from './quran/sources.ts';

const FILE = path.join(ROOT, 'data/curated/surah-slugs.json');

function slugify(transliteration: string): string {
  return transliteration
    .toLowerCase()
    .replace(/['’`]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

const exists = await access(FILE).then(
  () => true,
  () => false
);
if (exists && !process.argv.includes('--force')) {
  console.log(`${path.relative(ROOT, FILE)} exists — not overwritten (use --force).`);
  process.exit(0);
}

const meta = JSON.parse(await readFile(path.join(ROOT, 'content/quran/meta.json'), 'utf8')) as QuranMeta;
const surahs = meta.surahs.map((s) => ({ number: s.number, slug: slugify(s.transliteration), from: s.transliteration }));
const duplicates = surahs.filter((s, i) => surahs.findIndex((t) => t.slug === s.slug) !== i);
if (duplicates.length || surahs.some((s) => !s.slug)) throw new Error(`Slug collision/empty: ${JSON.stringify(duplicates)}`);

await mkdir(path.dirname(FILE), { recursive: true });
await writeFile(
  FILE,
  `${JSON.stringify(
    {
      schemaVersion: 1,
      status: 'generated — awaiting owner review',
      note: 'URL slugs for /quran/{slug}. Generated from the Tanzil transliteration (`from`); edit `slug` freely. Rules: lowercase a-z, 0-9 and hyphens; unique.',
      surahs,
    },
    null,
    2
  )}\n`,
  'utf8'
);
console.log(`Wrote ${path.relative(ROOT, FILE)} (${surahs.length} slugs), e.g. ${surahs.slice(0, 3).map((s) => s.slug).join(', ')}`);
