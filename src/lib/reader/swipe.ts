// Mushaf page swipes (SPEC §6): the Mushaf is an Arabic, right-to-left book, so a swipe to the
// right (finger moving left → right) turns to the NEXT page, as in a printed Mushaf. The Quran
// pages keep this direction in the English UI too.

export const SWIPE = { minDistance: 60, maxDurationMs: 800, horizontalRatio: 1.5 } as const;

export type PageTurn = 'next' | 'previous' | null;

export function mushafSwipe(dx: number, dy: number, durationMs: number): PageTurn {
  if (durationMs > SWIPE.maxDurationMs) return null;
  if (Math.abs(dx) < SWIPE.minDistance || Math.abs(dx) < SWIPE.horizontalRatio * Math.abs(dy)) return null;
  return dx > 0 ? 'next' : 'previous';
}

/** Keyboard page turns (SPEC §10): PageDown → next page, PageUp → previous page. */
export function mushafKeyTurn(key: string): PageTurn {
  if (key === 'PageDown') return 'next';
  if (key === 'PageUp') return 'previous';
  return null;
}
