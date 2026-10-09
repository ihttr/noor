import { readFileSync } from 'node:fs';
import path from 'node:path';
import { IDBFactory, IDBKeyRange } from 'fake-indexeddb';
import { describe, expect, it } from 'vitest';
import { firstGrapheme, isWord, maskAyah, MASK_MODES, wordCount } from '@/lib/memorize/mask';
import { initialState, isDue, review, startOfDay, type Grade, type SrsState } from '@/lib/memorize/srs';
import type { SurahFile } from '@/lib/quran/types';
import { openLocalStore } from '@/lib/store/dexie';

const DAY = 86_400_000;
const surah = (n: number): SurahFile => JSON.parse(readFileSync(path.join(process.cwd(), 'content/quran/surah', `${n}.json`), 'utf8')) as SurahFile;

describe('SRS scheduling (SPEC §7.12, D-065)', () => {
  const t0 = new Date(2026, 9, 9, 20, 30).getTime();
  const run = (grades: Grade[], step = (s: SrsState) => s.dueAt + 3_600_000) => {
    let s = initialState(t0);
    let now = t0;
    const log: SrsState[] = [];
    for (const g of grades) {
      s = review(s, g, now);
      log.push(s);
      now = step(s);
    }
    return log;
  };

  it('new ayahs are due today; intervals grow 1, 6, then × ease', () => {
    const s = initialState(t0);
    expect(s.status).toBe('NEW');
    expect(isDue(s, t0)).toBe(true);
    const log = run(['good', 'good', 'good', 'good']);
    expect(log.map((x) => x.intervalDays)).toEqual([1, 6, 16, 45]);
    expect(log.map((x) => x.ease)).toEqual([2.6, 2.7, 2.8, 2.9]);
    expect(log[0]!.dueAt).toBe(startOfDay(t0, 1));
  });

  it('memorized after 3 successful reviews with an interval of at least 7 days', () => {
    const log = run(['good', 'hard', 'good']);
    expect(log.map((x) => x.status)).toEqual(['REVIEWING', 'REVIEWING', 'MEMORIZED']);
    expect(log[2]!.intervalDays).toBeGreaterThanOrEqual(7);
  });

  it('"Didn\'t know" resets the run and lowers ease, never below 1.3', () => {
    const log = run(['good', 'good', 'good', 'again', 'again', 'again', 'again', 'again']);
    expect(log[3]).toMatchObject({ status: 'LEARNING', repetitions: 0, intervalDays: 1 });
    expect(Math.min(...log.map((x) => x.ease))).toBe(1.3);
    expect(log.at(-1)!.dueAt).toBe(startOfDay(log.at(-1)!.lastReviewedAt!, 1));
  });

  it('reviews before the due date do not move the schedule forward', () => {
    let s = review(initialState(t0), 'good', t0);
    const early = review(s, 'good', t0 + 60_000);
    expect(early).toMatchObject({ repetitions: 1, intervalDays: 1, dueAt: s.dueAt, lastReviewedAt: t0 + 60_000 });
    // A failure counts even early.
    s = review(early, 'again', t0 + 120_000);
    expect(s.repetitions).toBe(0);
  });

  it('due dates are local calendar days (DST-safe)', () => {
    const s = review(review(initialState(t0), 'good', t0), 'good', startOfDay(t0, 1) + 1000);
    expect(new Date(s.dueAt).getHours()).toBe(0);
    expect(Math.round((s.dueAt - startOfDay(t0, 1)) / DAY)).toBe(6);
  });
});

describe('practice masks (SPEC §7.12, D-066)', () => {
  it('every ayah of all 114 surahs: tokens rebuild the exact text in every mode', () => {
    let ayahs = 0;
    let nonWordTokens = 0;
    for (let n = 1; n <= 114; n++) {
      for (const a of surah(n).ayahs) {
        for (const mode of MASK_MODES) {
          const tokens = maskAyah(a.text, mode);
          expect(tokens.map((t) => t.text).join(' ') === a.text).toBe(true);
          expect(tokens.every((t) => t.shown + t.hidden === t.text)).toBe(true);
        }
        nonWordTokens += maskAyah(a.text, 'none').filter((t) => t.word < 0).length;
        ayahs++;
      }
    }
    expect(ayahs).toBe(6236);
    // Tanzil writes pause marks as separate tokens; they are not words.
    expect(nonWordTokens).toBeGreaterThan(1000);
  });

  it('modes hide all words, all but the first grapheme, or every other word; marks stay visible', () => {
    const text = surah(2).ayahs[1]!.text; // 2:2 has a pause mark token
    const marks = text.split(' ').filter((t) => !isWord(t));
    expect(marks.length).toBeGreaterThan(0);

    const all = maskAyah(text, 'all');
    expect(all.filter((t) => t.word >= 0).every((t) => t.shown === '')).toBe(true);
    expect(all.filter((t) => t.word < 0).every((t) => t.hidden === '')).toBe(true);

    const first = maskAyah(text, 'first').filter((t) => t.word >= 0);
    for (const t of first) {
      expect(t.shown).toBe(firstGrapheme(t.text));
      expect(t.text.startsWith(t.shown)).toBe(true);
    }
    // The first grapheme keeps the letter's marks: 1:1 starts with ب + kasra.
    expect([...firstGrapheme(surah(1).ayahs[0]!.text)].length).toBeGreaterThan(1);

    const alt = maskAyah(text, 'alternate').filter((t) => t.word >= 0);
    expect(alt.map((t) => t.hidden === '')).toEqual(alt.map((_, i) => i % 2 === 0));
    expect(wordCount(text)).toBe(alt.length);
  });
});

describe('local store: memorization and goals', () => {
  let n = 0;
  const open = (now = () => Date.now()) => openLocalStore({ name: `mem-${++n}`, indexedDB: new IDBFactory(), IDBKeyRange, wallClock: now });

  it('adds ranges once, reviews, removes and revives with a fresh schedule', async () => {
    const store = await open();
    expect(await store.memorization.add(67, [1, 2, 3, 3])).toBe(3);
    expect(await store.memorization.add(67, [2, 3, 4])).toBe(1);
    const item = await store.memorization.review(67, 1, 'good');
    expect(item).toMatchObject({ status: 'REVIEWING', repetitions: 1 });
    await store.memorization.remove(67, 3, 4);
    expect((await store.memorization.list()).map((x) => x.ayah)).toEqual([1, 2]);
    await store.memorization.review(67, 2, 'good');
    await store.memorization.remove(67);
    expect(await store.memorization.add(67, [2])).toBe(1);
    expect((await store.memorization.list())[0]).toMatchObject({ ayah: 2, status: 'NEW', repetitions: 0 });
    await expect(store.memorization.review(1, 1, 'good')).rejects.toThrow();
    await expect(store.memorization.add(115, [1])).rejects.toThrow();
    expect((await store.sync.pending()).filter((c) => c.table === 'memorizationItems').length).toBeGreaterThan(0);
    store.close();
  });

  it('goals: one per start date, 0 means none', async () => {
    const store = await open();
    await store.goals.set(5, '2026-10-01');
    await store.goals.set(10, '2026-10-09');
    await store.goals.set(20, '2026-10-09');
    expect((await store.goals.list()).map((g) => [g.activeFrom, g.amount])).toEqual([
      ['2026-10-01', 5],
      ['2026-10-09', 20],
    ]);
    await expect(store.goals.set(605, '2026-10-09')).rejects.toThrow();
    await expect(store.goals.set(-1, '2026-10-09')).rejects.toThrow();
    store.close();
  });
});
