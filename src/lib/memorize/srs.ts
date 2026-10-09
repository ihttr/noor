// Lightweight spaced repetition for memorization (SPEC §7.12, D-065): SM-2 with three grades.
//
// - "Didn't know" (quality 1) resets the run of successful reviews; the ayah is due tomorrow.
// - "Hesitant" (3) and "Knew it" (5) count as successful when the ayah is due (or new): intervals
//   1 day, 6 days, then the previous interval × the ease before this review (as in SM-2).
//   Reviewing before the due date records the review but does not move the schedule forward,
//   so practice sessions cannot inflate progress.
// - Ease follows SM-2: ease + 0.1 − (5 − q)(0.08 + (5 − q)·0.02), never below 1.3.
// - An ayah counts as memorized after 3 successful reviews with an interval of at least 7 days.
// Days are local calendar days: `dueAt` is the start of the due day.

import type { MemorizationStatus } from '../store/types.ts';

export type Grade = 'again' | 'hard' | 'good';
export const GRADES: readonly Grade[] = ['again', 'hard', 'good'];

const QUALITY: Record<Grade, number> = { again: 1, hard: 3, good: 5 };
export const MIN_EASE = 1.3;
export const START_EASE = 2.5;
export const MEMORIZED_REPETITIONS = 3;
export const MEMORIZED_MIN_INTERVAL_DAYS = 7;

export interface SrsState {
  status: MemorizationStatus;
  ease: number;
  intervalDays: number;
  repetitions: number;
  dueAt: number;
  lastReviewedAt: number | null;
}

/** Start of the local day containing `ms`, plus `days` calendar days (DST-safe). */
export function startOfDay(ms: number, days = 0): number {
  const d = new Date(ms);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + days).getTime();
}

export function initialState(now: number): SrsState {
  return { status: 'NEW', ease: START_EASE, intervalDays: 0, repetitions: 0, dueAt: startOfDay(now), lastReviewedAt: null };
}

export const isDue = (s: Pick<SrsState, 'status' | 'dueAt'>, now: number): boolean => s.status === 'NEW' || s.dueAt <= now;

export const isMemorized = (s: Pick<SrsState, 'repetitions' | 'intervalDays'>): boolean =>
  s.repetitions >= MEMORIZED_REPETITIONS && s.intervalDays >= MEMORIZED_MIN_INTERVAL_DAYS;

const round2 = (n: number) => Math.round(n * 100) / 100;

export function review(state: SrsState, grade: Grade, now: number): SrsState {
  const q = QUALITY[grade];
  const ease = round2(Math.max(MIN_EASE, state.ease + 0.1 - (5 - q) * (0.08 + (5 - q) * 0.02)));

  if (grade === 'again') {
    return { status: 'LEARNING', ease, intervalDays: 1, repetitions: 0, dueAt: startOfDay(now, 1), lastReviewedAt: now };
  }
  if (!isDue(state, now)) return { ...state, lastReviewedAt: now };

  const repetitions = state.repetitions + 1;
  const intervalDays = repetitions === 1 ? 1 : repetitions === 2 ? 6 : Math.max(state.intervalDays + 1, Math.round(state.intervalDays * state.ease));
  const next = { ease, intervalDays, repetitions, dueAt: startOfDay(now, intervalDays), lastReviewedAt: now };
  return { ...next, status: isMemorized(next) ? 'MEMORIZED' : 'REVIEWING' };
}
