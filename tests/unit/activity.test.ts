import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { PageReadCounter, PAGE_READ_RULES } from '@/lib/activity/page-read';
import { ACTIVE_WINDOW_MS, ReadingTimer, splitByDay } from '@/lib/activity/reading-time';
import { ayahCopyText, ayahReference, ayahShareUrl, formatNumber, usesArabicDigits } from '@/lib/reader/ayah-share';
import { buildEntries, countByType, filterEntries, foldForSearch, NO_FILTER, type SavedEntry } from '@/lib/saved/entries';
import type { SurahFile } from '@/lib/quran/types';
import type { NoteRecord, SavedItemRecord } from '@/lib/store/types';

const DAY = '2026-10-06';
const ayahs = (page: number, from: number, to: number) =>
  Array.from({ length: to - from + 1 }, (_, i) => ({ key: `2:${from + i}`, page }));

describe('page read (SPEC §7.7)', () => {
  it('Mushaf: a page counts after 15 s on screen in total, once per day', () => {
    const counter = new PageReadCounter(() => 7);
    const onPage = { ayahs: [], pages: [5] };
    expect(counter.tick(DAY, 'mushaf', onPage, 10_000)).toEqual([]);
    expect(counter.tick(DAY, 'mushaf', { ayahs: [], pages: [] }, 60_000)).toEqual([]);
    expect(counter.tick(DAY, 'mushaf', onPage, 5_000)).toEqual([5]);
    expect(counter.tick(DAY, 'mushaf', onPage, 60_000)).toEqual([]);
    // A new day starts from zero.
    expect(counter.tick('2026-10-07', 'mushaf', onPage, 14_999)).toEqual([]);
    expect(counter.tick('2026-10-07', 'mushaf', onPage, 1)).toEqual([5]);
  });

  it('reading mode: half of the page’s ayahs must each be visible for 15 s', () => {
    const counter = new PageReadCounter((page) => (page === 3 ? 10 : undefined));
    // Ayahs 1–4 of a 10-ayah page for 20 s: 4 < 5, not read.
    expect(counter.tick(DAY, 'reading', { ayahs: ayahs(3, 1, 4), pages: [3] }, 20_000)).toEqual([]);
    // Ayah 5 visible for 14 s: still not read.
    expect(counter.tick(DAY, 'reading', { ayahs: ayahs(3, 5, 5), pages: [3] }, 14_000)).toEqual([]);
    expect(counter.tick(DAY, 'reading', { ayahs: ayahs(3, 5, 5), pages: [3] }, 1_000)).toEqual([3]);
  });

  it('reading mode: skimming does not count', () => {
    const counter = new PageReadCounter(() => 6);
    for (let i = 1; i <= 6; i++) expect(counter.tick(DAY, 'reading', { ayahs: ayahs(4, i, i), pages: [4] }, 3_000)).toEqual([]);
  });

  it('uses configurable rules', () => {
    const counter = new PageReadCounter(() => 2, { ...PAGE_READ_RULES, ayahMs: 1000, ayahShare: 1 });
    expect(counter.tick(DAY, 'reading', { ayahs: ayahs(9, 1, 2), pages: [9] }, 1000)).toEqual([9]);
  });
});

describe('reading time (SPEC §7.7)', () => {
  const t0 = new Date(2026, 9, 6, 10, 0, 0).getTime();

  it('counts while visible and active within the last 60 s', () => {
    const timer = new ReadingTimer(t0, true);
    expect(timer.take(t0 + 30_000)).toEqual([{ date: DAY, seconds: 30 }]);
    // No activity since t0: counting stops at t0 + 60 s.
    expect(timer.take(t0 + 300_000)).toEqual([{ date: DAY, seconds: 30 }]);
    timer.activity(t0 + 400_000);
    expect(timer.take(t0 + 410_000)).toEqual([{ date: DAY, seconds: 10 }]);
  });

  it('does not count while the tab is hidden', () => {
    const timer = new ReadingTimer(t0, true);
    timer.setVisible(false, t0 + 5_000);
    timer.activity(t0 + 10_000);
    timer.setVisible(true, t0 + 20_000);
    expect(timer.take(t0 + 25_000)).toEqual([{ date: DAY, seconds: 10 }]);
  });

  it('counts while audio plays, even without activity', () => {
    const timer = new ReadingTimer(t0, true);
    timer.setAudio(true, t0);
    expect(timer.take(t0 + 5 * ACTIVE_WINDOW_MS)).toEqual([{ date: DAY, seconds: 300 }]);
  });

  it('keeps fractions and splits at local midnight', () => {
    const late = new Date(2026, 9, 6, 23, 59, 50).getTime();
    expect(splitByDay(late, late + 20_000)).toEqual([
      ['2026-10-06', 10_000],
      ['2026-10-07', 10_000],
    ]);
    const timer = new ReadingTimer(late, true);
    expect(timer.take(late + 20_500)).toEqual([
      { date: '2026-10-06', seconds: 10 },
      { date: '2026-10-07', seconds: 10 },
    ]);
    expect(timer.take(late + 21_000)).toEqual([{ date: '2026-10-07', seconds: 1 }]);
  });
});

describe('copy and share (SPEC §7.5)', () => {
  // The real ayah 2:255 from content/ (never typed by hand).
  const surah2 = JSON.parse(readFileSync(path.join(process.cwd(), 'content/quran/surah/2.json'), 'utf8')) as SurahFile;
  const text = surah2.ayahs[254]!.text;
  it('keeps the ayah text unchanged and adds the reference on its own line', () => {
    const ref = ayahReference({ surahName: 'البقرة', surah: 2, ayah: 255 }, 'ar', true);
    expect(ref).toBe('[البقرة: ٢٥٥]');
    const copied = ayahCopyText(text, ref);
    expect(copied.startsWith(text)).toBe(true);
    expect(copied.slice(0, text.length)).toBe(text);
    expect(copied).toBe(`${text}\n[البقرة: ٢٥٥]`);
    expect(ayahReference({ surahName: 'Al-Baqara', surah: 2, ayah: 255 }, 'en', false)).toBe('[Al-Baqara 2:255]');
  });

  it('follows the numeral setting', () => {
    expect(usesArabicDigits('auto', 'ar')).toBe(true);
    expect(usesArabicDigits('auto', 'en')).toBe(false);
    expect(usesArabicDigits('western', 'ar')).toBe(false);
    expect(usesArabicDigits('arabic', 'en')).toBe(true);
    expect(formatNumber(1234, true)).toBe('١٢٣٤');
  });

  it('builds locale-aware, stable ayah URLs', () => {
    expect(ayahShareUrl('https://noor.example', 'ar', 'al-baqara', 255)).toBe('https://noor.example/quran/al-baqara/255');
    expect(ayahShareUrl('https://noor.example', 'en', 'al-baqara', 255)).toBe('https://noor.example/en/quran/al-baqara/255');
  });
});

describe('saved entries (SPEC §7.6)', () => {
  const rec = { createdAt: 1, updatedAt: 1, deletedAt: null };
  const saved: SavedItemRecord[] = [
    { ...rec, id: 's1', type: 'AYAH', ref: '2:255', collectionId: 'c1', createdAt: 10 },
    { ...rec, id: 's2', type: 'PAGE', ref: '50', collectionId: null, createdAt: 30 },
    { ...rec, id: 's3', type: 'SURAH', ref: '18', collectionId: null, createdAt: 5, deletedAt: 6 },
  ];
  const notes: NoteRecord[] = [
    { ...rec, id: 'n1', targetType: 'AYAH', targetRef: '2:255', body: 'آية الكرسي', updatedAt: 40 },
    { ...rec, id: 'n2', targetType: 'AYAH', targetRef: '1:1', body: 'Opening', updatedAt: 20 },
  ];
  const entries = buildEntries(saved, notes);
  const text = (e: SavedEntry) => `${e.ref} ${e.note?.body ?? ''}`;

  it('one entry per target, saved item and note together, newest first, no tombstones', () => {
    expect(entries.map((e) => e.id)).toEqual(['AYAH|2:255', 'PAGE|50', 'AYAH|1:1']);
    expect(entries[0]).toMatchObject({ saved: { id: 's1' }, note: { id: 'n1' } });
    expect(entries[2]!.saved).toBeUndefined();
  });

  it('filters by type, notes, collection and normalized search', () => {
    expect(filterEntries(entries, { ...NO_FILTER, type: 'AYAH' }, text).map((e) => e.ref)).toEqual(['2:255', '1:1']);
    expect(filterEntries(entries, { ...NO_FILTER, type: 'NOTES' }, text).map((e) => e.ref)).toEqual(['2:255', '1:1']);
    expect(filterEntries(entries, { ...NO_FILTER, collection: 'c1' }, text).map((e) => e.ref)).toEqual(['2:255']);
    expect(filterEntries(entries, { ...NO_FILTER, collection: 'NONE' }, text).map((e) => e.ref)).toEqual(['50', '1:1']);
    // Hamza and case folding: "اية" finds "آية", "opening" finds "Opening".
    expect(filterEntries(entries, { ...NO_FILTER, query: 'اية' }, text).map((e) => e.ref)).toEqual(['2:255']);
    expect(filterEntries(entries, { ...NO_FILTER, query: 'opening' }, text).map((e) => e.ref)).toEqual(['1:1']);
    expect(filterEntries(entries, { ...NO_FILTER, query: '٢٥٥' }, text).map((e) => e.ref)).toEqual(['2:255']);
    expect(filterEntries(entries, { ...NO_FILTER, query: '٢٥٥ الكرسي' }, text).map((e) => e.ref)).toEqual(['2:255']);
    expect(filterEntries(entries, { ...NO_FILTER, query: '٢٥٥ opening' }, text)).toEqual([]);
    expect(foldForSearch('  Al-Kahf ')).toBe('al-kahf');
  });

  it('counts per type', () => {
    expect(countByType(entries)).toMatchObject({ ALL: 3, AYAH: 2, PAGE: 1, SURAH: 0, NOTES: 2 });
  });
});
