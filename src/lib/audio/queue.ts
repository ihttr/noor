// Playback order (SPEC §7.11): ayah by ayah through a surah, each ayah played `repeatAyah` times,
// then optionally the whole surah or an ayah range again. Pure, unit-tested.

export const REPEAT_MODES = ['off', 'surah', 'range'] as const;
export type RepeatMode = (typeof REPEAT_MODES)[number];

/** Times each ayah plays; Infinity repeats the current ayah until changed. */
export const REPEAT_AYAH_CHOICES = [1, 2, 3, 5, 10, Number.POSITIVE_INFINITY] as const;
export const SPEEDS = [0.75, 1, 1.25, 1.5, 1.75, 2] as const;

export interface QueueState {
  ayah: number;
  ayahCount: number;
  /** How many times the current ayah has started (1 on the first play). */
  played: number;
  repeatAyah: number;
  repeat: RepeatMode;
  range: { from: number; to: number } | null;
}

/** First and last ayah of the part that is played. */
export function bounds(s: Pick<QueueState, 'ayahCount' | 'repeat' | 'range'>): { first: number; last: number } {
  if (s.repeat === 'range' && s.range) return { first: s.range.from, last: s.range.to };
  return { first: 1, last: s.ayahCount };
}

/** What plays after the current ayah ends, or null at the end. */
export function nextStep(s: QueueState): { ayah: number; played: number } | null {
  if (s.played < s.repeatAyah) return { ayah: s.ayah, played: s.played + 1 };
  const { first, last } = bounds(s);
  if (s.ayah < last) return { ayah: Math.max(s.ayah + 1, first), played: 1 };
  if (s.repeat !== 'off') return { ayah: first, played: 1 };
  return null;
}

/** Manual previous/next ayah, kept inside the surah (or the range when repeating one). */
export function stepAyah(s: QueueState, step: -1 | 1): number {
  const { first, last } = bounds(s);
  return Math.min(last, Math.max(first, s.ayah + step));
}

/** A valid range inside the surah (from ≤ to), or null. */
export function clampRange(from: number, to: number, ayahCount: number): { from: number; to: number } | null {
  const a = Math.round(from);
  const b = Math.round(to);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  const lo = Math.max(1, Math.min(a, b));
  const hi = Math.min(ayahCount, Math.max(a, b));
  return lo <= hi ? { from: lo, to: hi } : null;
}
