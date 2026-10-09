// Maps matched Simple Clean word positions onto the Uthmani text for highlighting (SPEC §7.8,
// DECISIONS D-013). The Uthmani string is only cut into consecutive pieces at spaces — never
// changed — so the pieces always join back to the exact source string. Tokens made only of
// marks (pause marks, the sajdah sign…) are not words. When the word counts of the two texts
// differ (the two editions split some words differently), the whole ayah is highlighted.

export interface TextPiece {
  text: string;
  mark: boolean;
}

/** Combining marks and Quranic annotation signs: a token of only these is not a word. */
const MARK_ONLY = /^[\p{M}ۖ-ۭ]+$/u;

/** Splits at U+0020 into word tokens and separators; returns each piece with its word index (or null). */
export function displayTokens(text: string): { text: string; word: number | null }[] {
  const out: { text: string; word: number | null }[] = [];
  let word = 0;
  let i = 0;
  while (i < text.length) {
    const space = text.indexOf(' ', i);
    const end = space === -1 ? text.length : space;
    if (end > i) {
      const token = text.slice(i, end);
      out.push({ text: token, word: MARK_ONLY.test(token) ? null : word++ });
    }
    if (space === -1) break;
    out.push({ text: ' ', word: null });
    i = space + 1;
  }
  return out;
}

export function uthmaniWordCount(text: string): number {
  return displayTokens(text).filter((t) => t.word !== null).length;
}

/**
 * Pieces of `text` with the matched words marked. `exact` is false when the word counts differ
 * and the whole ayah is marked instead.
 */
export function highlightPieces(text: string, matched: readonly number[], simpleWordCount: number): { pieces: TextPiece[]; exact: boolean } {
  const tokens = displayTokens(text);
  if (tokens.filter((t) => t.word !== null).length !== simpleWordCount) return { pieces: [{ text, mark: true }], exact: false };
  const set = new Set(matched);
  const pieces: TextPiece[] = [];
  tokens.forEach((t, i) => {
    let mark = t.word !== null && set.has(t.word);
    // A space or mark-only token between two marked words joins the highlight.
    if (t.word === null) {
      const prev = tokens.slice(0, i).reverse().find((x) => x.word !== null);
      const next = tokens.slice(i + 1).find((x) => x.word !== null);
      mark = !!prev && !!next && set.has(prev.word!) && set.has(next.word!);
    }
    const last = pieces.at(-1);
    if (last && last.mark === mark) last.text += t.text;
    else pieces.push({ text: t.text, mark });
  });
  return { pieces, exact: true };
}
