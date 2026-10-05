import { describe, expect, it } from 'vitest';
import { getMeta } from '@/lib/quran/content';
import { matchesSurah } from '@/lib/quran/filter';
import { jumpStart, pageOfRef, readerHref, toNavData } from '@/lib/quran/nav';
import { allSlugs, resolveSurahParam, slugOf, surahHref } from '@/lib/quran/slugs';
import { DEFAULT_READER_SETTINGS, parseReaderSettings, readerBootScript, READER_STORAGE_KEY } from '@/lib/reader/settings';
import { mushafKeyTurn, mushafSwipe } from '@/lib/reader/swipe';

const meta = await getMeta();
const nav = toNavData(meta, slugOf);

describe('reading settings (SPEC §7.4)', () => {
  it('sanitizes stored values', () => {
    expect(parseReaderSettings(null)).toEqual(DEFAULT_READER_SETTINGS);
    expect(parseReaderSettings({ font: 'comic', size: 999, lineHeight: 0.2, width: 'huge', numerals: 'roman' })).toEqual({
      ...DEFAULT_READER_SETTINGS,
      size: 56,
      lineHeight: 1.6,
    });
    expect(parseReaderSettings({ font: 'scheherazade', size: 41, lineHeight: 2.46, width: 'wide', numerals: 'western' })).toEqual({
      font: 'scheherazade',
      size: 41,
      lineHeight: 2.5,
      width: 'wide',
      numerals: 'western',
    });
  });

  it('boot script applies stored settings before paint and ignores invalid ones', () => {
    const run = (stored: unknown) => {
      const props: Record<string, string> = {};
      const root = { dataset: {} as Record<string, string>, style: { setProperty: (k: string, v: string) => (props[k] = v) } };
      const storage = { getItem: (k: string) => (k === READER_STORAGE_KEY ? JSON.stringify(stored) : null) };
      new Function('localStorage', 'document', readerBootScript)(storage, { documentElement: root });
      return { dataset: root.dataset, props };
    };
    expect(run({ font: 'scheherazade', size: 40, lineHeight: 2.5, width: 'narrow', numerals: 'arabic' })).toEqual({
      dataset: { quranFont: 'scheherazade', quranWidth: 'narrow', numerals: 'arabic' },
      props: { '--quran-size': '40px', '--quran-lh': '2.5' },
    });
    expect(run({ font: 'x', size: 500 })).toEqual({ dataset: {}, props: {} });
  });
});

describe('Mushaf swipes (right-to-left book)', () => {
  it('swipe right turns to the next page, left to the previous one', () => {
    expect(mushafSwipe(120, 10, 300)).toBe('next');
    expect(mushafSwipe(-120, 10, 300)).toBe('previous');
  });
  it('ignores short, slow or vertical gestures', () => {
    expect(mushafSwipe(30, 0, 200)).toBeNull();
    expect(mushafSwipe(150, 0, 1500)).toBeNull();
    expect(mushafSwipe(100, 90, 200)).toBeNull();
  });
  it('maps PageDown/PageUp', () => {
    expect(mushafKeyTurn('PageDown')).toBe('next');
    expect(mushafKeyTurn('PageUp')).toBe('previous');
    expect(mushafKeyTurn('ArrowLeft')).toBeNull();
  });
});

describe('surah filter (SPEC §7.2)', () => {
  const find = (q: string) => meta.surahs.filter((s) => matchesSurah(q, s)).map((s) => s.number);
  it.each([
    ['الكهف', [18]],
    ['كهف', [18]],
    ['kahf', [18]],
    ['The Cave', [18]],
    ['١٨', [18]],
  ])('%s', (q, expected) => {
    expect(find(q)).toEqual(expected);
  });
  it('matches by number prefix and returns everything for an empty query', () => {
    expect(find('11')).toEqual([11, 110, 111, 112, 113, 114]);
    expect(find('  ')).toHaveLength(114);
  });
});

describe('slugs and navigation', () => {
  it('has 114 unique slugs and resolves numbers for redirects', () => {
    expect(new Set(allSlugs()).size).toBe(114);
    expect(resolveSurahParam(slugOf(2))).toEqual({ surah: 2, canonical: true });
    expect(resolveSurahParam('2')).toEqual({ surah: 2, canonical: false });
    expect(resolveSurahParam('115')).toBeNull();
    expect(surahHref(2, 255)).toBe(`/quran/${slugOf(2)}#ayah-2-255`);
  });

  it('resolves jumps to their first ayah in each mode', () => {
    expect(jumpStart(nav, { kind: 'juz', number: 30 })).toEqual({ surah: 78, ayah: 1 });
    expect(jumpStart(nav, { kind: 'hizb', number: 1 })).toEqual({ surah: 1, ayah: 1 });
    expect(jumpStart(nav, { kind: 'quarter', number: 2 })).toEqual(meta.hizbQuarters[1]!.start);
    expect(jumpStart(nav, { kind: 'page', number: 605 })).toBeNull();
    expect(jumpStart(nav, { kind: 'ayah', surah: 2, ayah: 300 })).toBeNull();
    expect(pageOfRef(nav, { surah: 2, ayah: 255 })).toBe(42);
    expect(readerHref(nav, { surah: 2, ayah: 255 }, 'mushaf')).toBe('/mushaf/page/42#ayah-2-255');
    expect(readerHref(nav, { surah: 18, ayah: 10 }, 'reading')).toBe(`/quran/${slugOf(18)}#ayah-18-10`);
  });
});
