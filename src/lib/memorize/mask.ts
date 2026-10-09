// Memorization practice masks (SPEC §7.12, D-066). A mask only decides how parts of an ayah are
// displayed: the ayah is split at its spaces (U+0020) into tokens, and joining the tokens with
// single spaces gives back the exact stored text. Nothing here changes a code point.
//
// - A token is a word when it contains a letter; tokens of pause or annotation marks only
//   (e.g. U+06D6–U+06DC, U+06DE, U+06E9) are not words and are never hidden.
// - "First letter" shows the first grapheme cluster of a word (the letter with its marks).

export type MaskMode = 'none' | 'all' | 'first' | 'alternate';
export const MASK_MODES: readonly MaskMode[] = ['none', 'all', 'first', 'alternate'];

export interface MaskToken {
  /** The token's text, verbatim. */
  text: string;
  /** Index among the ayah's words, or -1 for a token of marks only. */
  word: number;
  /** Displayed part (verbatim prefix of `text`). */
  shown: string;
  /** Hidden part (the rest of `text`), revealed on request. */
  hidden: string;
}

const LETTER = /\p{L}/u;
let segmenter: Intl.Segmenter | undefined;

export const isWord = (token: string): boolean => LETTER.test(token);

/** First grapheme cluster (the letter with its combining marks). */
export function firstGrapheme(text: string): string {
  segmenter ??= new Intl.Segmenter('ar', { granularity: 'grapheme' });
  for (const { segment } of segmenter.segment(text)) return segment;
  return '';
}

/** Splits an ayah for display. `tokens.map(t => t.text).join(' ') === ayah` always holds. */
export function maskAyah(ayah: string, mode: MaskMode): MaskToken[] {
  let words = 0;
  return ayah.split(' ').map((text) => {
    if (!isWord(text)) return { text, word: -1, shown: text, hidden: '' };
    const word = words++;
    const hideAll = mode === 'all' || (mode === 'alternate' && word % 2 === 1);
    if (hideAll) return { text, word, shown: '', hidden: text };
    if (mode === 'first') {
      const shown = firstGrapheme(text);
      return { text, word, shown, hidden: text.slice(shown.length) };
    }
    return { text, word, shown: text, hidden: '' };
  });
}

export const wordCount = (ayah: string): number => ayah.split(' ').filter(isWord).length;
