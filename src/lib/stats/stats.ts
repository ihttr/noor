// Goals, consistency and statistics (SPEC §7.13, D-067). Pure functions over local dates
// (`YYYY-MM-DD`). A day counts as "read" when at least one page was read that day.

import type { GoalRecord, ReadingDayRecord } from '../store/types.ts';

export const GOAL_PRESETS = [2, 5, 10, 20] as const;
/** "1 Juz ≈ 20 pages" (SPEC §7.13). */
export const PAGES_PER_JUZ = 20;

const parse = (date: string) => {
  const [y, m, d] = date.split('-').map(Number) as [number, number, number];
  return Date.UTC(y, m - 1, d);
};
const format = (utc: number) => new Date(utc).toISOString().slice(0, 10);

export const addDays = (date: string, days: number): string => format(parse(date) + days * 86_400_000);

/** Inclusive number of days from `from` to `to`. */
export const daysBetween = (from: string, to: string): number => Math.round((parse(to) - parse(from)) / 86_400_000) + 1;

/** ISO weekday: 1 = Monday … 7 = Sunday. */
export const weekday = (date: string): number => new Date(parse(date)).getUTCDay() || 7;

/** First day of the week containing `date`; `firstDay` as in `Intl.Locale#getWeekInfo` (1 = Monday … 7 = Sunday). */
export const weekStart = (date: string, firstDay: number): string => addDays(date, -((weekday(date) - firstDay + 7) % 7));

export const monthStart = (date: string): string => `${date.slice(0, 8)}01`;

/** The locale's first day of the week (Saturday for Arabic, Sunday for English by CLDR); Monday when unknown. */
export function firstDayOfWeek(locale: string): number {
  try {
    const l = new Intl.Locale(locale) as Intl.Locale & { getWeekInfo?: () => { firstDay: number }; weekInfo?: { firstDay: number } };
    return l.getWeekInfo?.().firstDay ?? l.weekInfo?.firstDay ?? 1;
  } catch {
    return 1;
  }
}

export type DayIndex = ReadonlyMap<string, Pick<ReadingDayRecord, 'pagesRead' | 'secondsRead'>>;

export const indexDays = (days: readonly ReadingDayRecord[]): DayIndex => new Map(days.map((d) => [d.date, d]));

export const pagesOn = (days: DayIndex, date: string): number => days.get(date)?.pagesRead.length ?? 0;

/** The daily goal in pages on `date` (latest goal that started on or before it; 0 = none). */
export function goalOn(goals: readonly Pick<GoalRecord, 'activeFrom' | 'amount'>[], date: string): number {
  let amount = 0;
  let start = '';
  for (const g of goals) {
    if (g.activeFrom <= date && g.activeFrom >= start) {
      start = g.activeFrom;
      amount = g.amount;
    }
  }
  return amount;
}

export interface Period {
  from: string;
  to: string;
  /** Pages read in the period (a page read on two days counts twice). */
  pages: number;
  /** Sum of the daily goals over the days of the period so far. */
  goal: number;
  daysRead: number;
  days: number;
  seconds: number;
}

/** Totals from `from` to `to` (inclusive). */
export function period(days: DayIndex, goals: readonly Pick<GoalRecord, 'activeFrom' | 'amount'>[], from: string, to: string): Period {
  const p: Period = { from, to, pages: 0, goal: 0, daysRead: 0, days: 0, seconds: 0 };
  for (let d = from; d <= to; d = addDays(d, 1)) {
    const n = pagesOn(days, d);
    p.pages += n;
    p.seconds += days.get(d)?.secondsRead ?? 0;
    if (n > 0) p.daysRead++;
    p.goal += goalOn(goals, d);
    p.days++;
  }
  return p;
}

/**
 * Consecutive days read up to today — or up to yesterday while today has no reading yet, so the
 * count never drops during the day (no loss framing, SPEC §7.13).
 */
export function streak(days: DayIndex, today: string): number {
  let d = pagesOn(days, today) > 0 ? today : addDays(today, -1);
  let n = 0;
  while (pagesOn(days, d) > 0) {
    n++;
    d = addDays(d, -1);
  }
  return n;
}

/** Surahs whose every page was read at least once (on any day). `ranges[i]` = [first, last] page of surah i + 1. */
export function surahsCompleted(days: readonly Pick<ReadingDayRecord, 'pagesRead'>[], ranges: readonly (readonly [number, number])[]): number {
  const read = new Set(days.flatMap((d) => d.pagesRead));
  return ranges.filter(([first, last]) => {
    for (let p = first; p <= last; p++) if (!read.has(p)) return false;
    return true;
  }).length;
}

/** Heat level 0–4: relative to the goal when there is one, else 1–2 / 3–5 / 6–10 / 11+ pages. */
export function heatLevel(pages: number, goal: number): 0 | 1 | 2 | 3 | 4 {
  if (pages <= 0) return 0;
  if (goal > 0) return pages >= goal ? 4 : pages >= (goal * 2) / 3 ? 3 : pages >= goal / 3 ? 2 : 1;
  return pages >= 11 ? 4 : pages >= 6 ? 3 : pages >= 3 ? 2 : 1;
}

export interface HeatCell {
  date: string;
  pages: number;
  level: 0 | 1 | 2 | 3 | 4;
  future: boolean;
}

/** `weeks` columns (oldest first) of 7 days each, the last column holding today. */
export function heatmap(days: DayIndex, goals: readonly Pick<GoalRecord, 'activeFrom' | 'amount'>[], today: string, weeks: number, firstDay: number): HeatCell[][] {
  const start = addDays(weekStart(today, firstDay), -7 * (weeks - 1));
  return Array.from({ length: weeks }, (_, w) =>
    Array.from({ length: 7 }, (_, i) => {
      const date = addDays(start, w * 7 + i);
      const pages = pagesOn(days, date);
      return { date, pages, level: heatLevel(pages, goalOn(goals, date)), future: date > today };
    })
  );
}
