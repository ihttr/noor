import { describe, expect, it } from 'vitest';
import { normalizeArabic, normalizeQuery, toAsciiDigits } from '@/lib/quran/normalize';
import { getSearchIndex, getSurah } from '@/lib/quran/content';

// Sample words are ordinary Arabic words (not Quran text) chosen to exercise each rule.

describe('search normalization (SPEC §7.8)', () => {
  it('unifies alef forms: أ إ آ ٱ → ا', () => {
    expect(normalizeArabic('أحمد إسلام آمال ٱسم')).toBe('احمد اسلام امال اسم');
  });

  it('maps ة → ه, ى → ي, ؤ → و, ئ → ي', () => {
    expect(normalizeArabic('مدرسة')).toBe('مدرسه');
    expect(normalizeArabic('مستشفى')).toBe('مستشفي');
    expect(normalizeArabic('مسؤول')).toBe('مسوول');
    expect(normalizeArabic('سائل')).toBe('سايل');
  });

  it('never converts ه → ة', () => {
    expect(normalizeArabic('وجه')).toBe('وجه');
  });

  it('removes tashkeel and tatweel', () => {
    expect(normalizeArabic('مُدَرِّسَةٌ')).toBe('مدرسه');
    expect(normalizeArabic('جـــميل')).toBe('جميل');
  });

  it('is idempotent and keeps spaces', () => {
    const once = normalizeArabic('كِتَابٌ  جَدِيدٌ');
    expect(normalizeArabic(once)).toBe(once);
    expect(once).toBe('كتاب  جديد');
  });

  it('normalizes queries: digits and whitespace', () => {
    expect(toAsciiDigits('٢:٢٥٥ ۱۲')).toBe('2:255 12');
    expect(normalizeQuery('  الصَّلاةُ   ')).toBe('الصلاه');
  });

  it('removes every diacritic and Quranic mark from real Uthmani text', async () => {
    const marks = /[ؐ-ًؚ-ٰٟۖ-ۭـ]/u;
    for (const n of [1, 2, 18, 36]) {
      for (const ayah of (await getSurah(n)).ayahs) expect(marks.test(normalizeArabic(ayah.text))).toBe(false);
    }
  });

  it('the search index holds only normalized text', async () => {
    const index = await getSearchIndex();
    expect(index.entries).toHaveLength(6236);
    for (const [, text] of index.entries) expect(normalizeArabic(text)).toBe(text);
  });
});
