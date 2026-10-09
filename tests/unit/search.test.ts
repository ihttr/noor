import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { divisionAt, ayahIndex } from '@/lib/quran/structure';
import type { QuranMeta, SearchIndexFile, SurahFile } from '@/lib/quran/types';
import { displayTokens, highlightPieces, uthmaniWordCount } from '@/lib/search/highlight';
import { indexAyahs, searchQuran } from '@/lib/search/quran-search';

const read = <T,>(p: string) => JSON.parse(readFileSync(path.join(process.cwd(), 'content', p), 'utf8')) as T;
const meta = read<QuranMeta>('quran/meta.json');
const file = read<SearchIndexFile>('search/index.json');
const index = indexAyahs(file.entries, (i) => divisionAt(meta, meta.juz, i));
const surahs = Array.from({ length: 114 }, (_, i) => read<SurahFile>(`quran/surah/${i + 1}.json`));
const uthmani = (s: number, a: number) => surahs[s - 1]!.ayahs[a - 1]!.text;

describe('Quran search (SPEC §7.8)', () => {
  it('indexes every ayah with its juz', () => {
    expect(index).toHaveLength(6236);
    expect(index[ayahIndex(meta, { surah: 78, ayah: 1 })]!.juz).toBe(30);
    expect(index[0]!.juz).toBe(1);
  });

  it('matches regardless of hamza forms, taa marbuta and tashkeel in the query', () => {
    const a = searchQuran(index, 'الكهف', { mode: 'phrase' });
    expect(a.hits.map((h) => h.key)).toContain('18:9');
    const b = searchQuran(index, 'الْكَهْفِ', { mode: 'phrase' });
    expect(b.total).toBe(a.total);
    expect(searchQuran(index, 'رحمة', { mode: 'partial' }).total).toBe(searchQuran(index, 'رحمه', { mode: 'partial' }).total);
  });

  it('phrase needs whole consecutive words; partial also finds parts of words', () => {
    expect(searchQuran(index, 'كهف', { mode: 'phrase' }).total).toBe(0);
    const partial = searchQuran(index, 'كهف', { mode: 'partial' });
    expect(partial.hits.map((h) => h.key)).toContain('18:9');
    const hit = partial.hits.find((h) => h.key === '18:9')!;
    expect(index[ayahIndex(meta, { surah: 18, ayah: 9 })]!.words[hit.words[0]!]).toContain('كهف');
  });

  it('all-words mode finds words in any order', () => {
    const forward = searchQuran(index, 'الحي القيوم', { mode: 'phrase' });
    expect(forward.hits.map((h) => h.key)).toEqual(['2:255', '3:2']);
    // 20:111 has «للحي القيوم»: a partial match, not a whole-word phrase.
    expect(searchQuran(index, 'حي القيوم', { mode: 'partial' }).hits.map((h) => h.key)).toContain('20:111');
    expect(searchQuran(index, 'القيوم الحي', { mode: 'phrase' }).total).toBe(0);
    expect(searchQuran(index, 'القيوم الحي', { mode: 'all' }).hits.map((h) => h.key)).toEqual(expect.arrayContaining(['2:255']));
  });

  it('filters by surah and juz, and limits the hits but not the total', () => {
    const all = searchQuran(index, 'الله', { mode: 'phrase' });
    const inBaqarah = searchQuran(index, 'الله', { mode: 'phrase', surah: 2 });
    expect(inBaqarah.hits.every((h) => h.surah === 2)).toBe(true);
    expect(inBaqarah.total).toBeLessThan(all.total);
    const juz30 = searchQuran(index, 'الله', { mode: 'phrase', juz: 30 });
    expect(juz30.hits.every((h) => h.surah >= 78)).toBe(true);
    const limited = searchQuran(index, 'الله', { mode: 'phrase' }, 10);
    expect(limited.hits).toHaveLength(10);
    expect(limited.total).toBe(all.total);
    expect(searchQuran(index, '   ', { mode: 'all' }).total).toBe(0);
  });
});

describe('highlighting on the Uthmani text (D-013)', () => {
  it('pieces always join back to the exact source string, for every ayah', () => {
    let exact = 0;
    for (const a of index) {
      const text = uthmani(a.surah, a.ayah);
      const { pieces, exact: ok } = highlightPieces(text, [0], a.words.length);
      expect(pieces.map((p) => p.text).join('') === text).toBe(true);
      if (ok) exact++;
    }
    // Most ayahs map word for word; the rest are highlighted whole. Recorded in D-050.
    expect(exact).toBeGreaterThan(6236 * 0.9);
    console.log(`word-for-word highlight: ${exact} of 6236 ayahs`);
  });

  it('marks the matched words (with the space between consecutive ones)', () => {
    const text = uthmani(2, 255);
    const hit = searchQuran(index, 'الحي القيوم', { mode: 'phrase', surah: 2 }).hits.find((h) => h.key === '2:255')!;
    const { pieces, exact } = highlightPieces(text, hit.words, hit.wordCount);
    expect(exact).toBe(true);
    const marked = pieces.filter((p) => p.mark);
    expect(marked).toHaveLength(1);
    expect(uthmaniWordCount(marked[0]!.text)).toBe(2);
  });

  it('mark-only tokens are not words', () => {
    const tokens = displayTokens(uthmani(2, 2));
    expect(tokens.map((t) => t.text).join('')).toBe(uthmani(2, 2));
    expect(tokens.some((t) => t.word === null && t.text !== ' ')).toBe(true);
  });
});
