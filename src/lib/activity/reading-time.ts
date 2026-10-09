// Reading time (SPEC §7.7, D-047): time counts only while the tab is visible and the reader was
// active (pointer, key, wheel, touch or scroll) within the last 60 s, or while audio is playing.
// Pure bookkeeping driven by timestamps, split by local calendar day.

import { localDate } from '../store/refs.ts';

export const ACTIVE_WINDOW_MS = 60_000;

/** Splits [start, end) at local midnights: `[date, ms]` pairs. */
export function splitByDay(start: number, end: number): [string, number][] {
  const parts: [string, number][] = [];
  let t = start;
  while (t < end) {
    const d = new Date(t);
    const midnight = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1).getTime();
    const stop = Math.min(end, midnight);
    parts.push([localDate(t), stop - t]);
    t = stop;
  }
  return parts;
}

export class ReadingTimer {
  private mark: number;
  private lastActivity: number;
  private visible: boolean;
  private audio = false;
  private readonly windowMs: number;
  private readonly pending = new Map<string, number>();

  /** Starting counts as activity: the reader just opened the page. */
  constructor(now: number, visible: boolean, windowMs = ACTIVE_WINDOW_MS) {
    this.mark = now;
    this.lastActivity = now;
    this.visible = visible;
    this.windowMs = windowMs;
  }

  private advance(now: number): void {
    if (now <= this.mark) return;
    if (this.visible) {
      const end = this.audio ? now : Math.min(now, this.lastActivity + this.windowMs);
      if (end > this.mark) {
        for (const [date, ms] of splitByDay(this.mark, end)) this.pending.set(date, (this.pending.get(date) ?? 0) + ms);
      }
    }
    this.mark = now;
  }

  activity(now: number): void {
    this.advance(now);
    this.lastActivity = Math.max(this.lastActivity, now);
  }

  setVisible(visible: boolean, now: number): void {
    this.advance(now);
    this.visible = visible;
  }

  /** Phase 6 (audio) calls this; the end of playback counts as activity. */
  setAudio(playing: boolean, now: number): void {
    this.advance(now);
    this.audio = playing;
    if (!playing) this.lastActivity = Math.max(this.lastActivity, now);
  }

  /** Whole seconds counted per day since the last call; fractions carry over. */
  take(now: number): { date: string; seconds: number }[] {
    this.advance(now);
    const out: { date: string; seconds: number }[] = [];
    for (const [date, ms] of this.pending) {
      const seconds = Math.floor(ms / 1000);
      if (seconds > 0) out.push({ date, seconds });
      const rest = ms - seconds * 1000;
      if (rest > 0) this.pending.set(date, rest);
      else this.pending.delete(date);
    }
    return out;
  }
}
