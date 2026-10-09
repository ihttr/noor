import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { checkCoverage } from '../../scripts/tafsir/build.ts';
import { TRANSLATIONS } from '../../scripts/translation/definitions.ts';
import { decodeXmlAttribute } from '../../scripts/translation/parse.ts';
import type { QuranMeta } from '@/lib/quran/types';
import type { TranslationRegistry } from '@/lib/translations/types';

// The translation pipeline (SPEC §7.9) is ready, but no translation is approved yet (D-020):
// the candidate files are only parsed here, never written to content/.
const root = process.cwd();
const meta = JSON.parse(readFileSync(path.join(root, 'content/quran/meta.json'), 'utf8')) as QuranMeta;
const counts = meta.surahs.map((s) => s.ayahCount);
const fileOf = (def: { id: string; file: string }) =>
  path.join(root, 'data/sources/translations', def.id.startsWith('quranenc-') ? 'quranenc' : 'tanzil', def.file);

describe('translation sources parse completely (candidates, not imported)', () => {
  it.each(Object.values(TRANSLATIONS).map((d) => [d.id, d] as const))('%s', (_id, def) => {
    const xml = readFileSync(fileOf(def), 'utf8');
    const rows = def.parse(xml, def.file);
    expect(() => checkCoverage(rows, counts, def.id)).not.toThrow();
    expect(rows.every((r) => r.text.length > 0)).toBe(true);
    if (def.translatorInFile) expect(def.translatorInFile(xml)).toBe(def.translator);
    if (def.id.startsWith('quranenc-')) expect(def.version(xml)).toMatch(/^v\d+\.\d+\.\d+/);
  });

  it('decodes only XML entities', () => {
    expect(decodeXmlAttribute('[All] praise &amp; &quot;x&quot; &#39;y&#x27;')).toBe('[All] praise & "x" \'y\'');
    expect(() => decodeXmlAttribute('&nbsp;')).toThrow();
  });

  it('nothing is imported until a translation is approved (D-020)', () => {
    const registry = JSON.parse(readFileSync(path.join(root, 'content/translations/registry.json'), 'utf8')) as TranslationRegistry;
    expect(registry.translations).toEqual([]);
  });
});
