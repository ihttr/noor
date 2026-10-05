// Reading settings (SPEC §7.4). Kept in localStorage for now (Phase 4 moves user data to IndexedDB)
// and applied to <html> by an inline script before first paint, so there is no flash.

export const QURAN_FONTS = ['amiri', 'scheherazade'] as const;
export const NUMERAL_STYLES = ['auto', 'arabic', 'western'] as const;
export const CONTENT_WIDTHS = ['narrow', 'normal', 'wide'] as const;

export type QuranFont = (typeof QURAN_FONTS)[number];
export type NumeralStyle = (typeof NUMERAL_STYLES)[number];
export type ContentWidth = (typeof CONTENT_WIDTHS)[number];

export interface ReaderSettings {
  font: QuranFont;
  /** px */
  size: number;
  lineHeight: number;
  width: ContentWidth;
  /** `auto`: Arabic-Indic digits in the Arabic UI, Western digits in the English UI. */
  numerals: NumeralStyle;
}

export const SIZE = { min: 20, max: 56, step: 2 } as const;
export const LINE_HEIGHT = { min: 1.6, max: 3, step: 0.1 } as const;

export const DEFAULT_READER_SETTINGS: ReaderSettings = {
  font: 'amiri',
  size: 32,
  lineHeight: 2.2,
  width: 'normal',
  numerals: 'auto',
};

export const READER_STORAGE_KEY = 'noor:reader';

const oneOf = <T extends string>(list: readonly T[], value: unknown, fallback: T): T =>
  typeof value === 'string' && (list as readonly string[]).includes(value) ? (value as T) : fallback;

const clamp = (value: unknown, min: number, max: number, fallback: number): number =>
  typeof value === 'number' && Number.isFinite(value) ? Math.min(max, Math.max(min, value)) : fallback;

/** Sanitizes anything read from storage into valid settings. */
export function parseReaderSettings(raw: unknown): ReaderSettings {
  const o = (typeof raw === 'object' && raw !== null ? raw : {}) as Record<string, unknown>;
  const d = DEFAULT_READER_SETTINGS;
  return {
    font: oneOf(QURAN_FONTS, o.font, d.font),
    size: Math.round(clamp(o.size, SIZE.min, SIZE.max, d.size)),
    lineHeight: Math.round(clamp(o.lineHeight, LINE_HEIGHT.min, LINE_HEIGHT.max, d.lineHeight) * 10) / 10,
    width: oneOf(CONTENT_WIDTHS, o.width, d.width),
    numerals: oneOf(NUMERAL_STYLES, o.numerals, d.numerals),
  };
}

/** Writes the settings onto <html> as data attributes and CSS variables. */
export function applyReaderSettings(root: HTMLElement, s: ReaderSettings): void {
  root.dataset.quranFont = s.font;
  root.dataset.quranWidth = s.width;
  root.dataset.numerals = s.numerals;
  root.style.setProperty('--quran-size', `${s.size}px`);
  root.style.setProperty('--quran-lh', String(s.lineHeight));
}

/** Inline, dependency-free version of parse + apply for the <head> boot script. */
export const readerBootScript = `(function(){try{var s=null;try{s=JSON.parse(localStorage.getItem(${JSON.stringify(
  READER_STORAGE_KEY
)})||'null')}catch(e){}if(!s||typeof s!=='object')return;var r=document.documentElement;var pick=function(v,l){return l.indexOf(v)>=0?v:null};var f=pick(s.font,${JSON.stringify(
  QURAN_FONTS
)}),w=pick(s.width,${JSON.stringify(CONTENT_WIDTHS)}),n=pick(s.numerals,${JSON.stringify(
  NUMERAL_STYLES
)});if(f)r.dataset.quranFont=f;if(w)r.dataset.quranWidth=w;if(n)r.dataset.numerals=n;if(typeof s.size==='number'&&s.size>=${SIZE.min}&&s.size<=${SIZE.max})r.style.setProperty('--quran-size',s.size+'px');if(typeof s.lineHeight==='number'&&s.lineHeight>=${LINE_HEIGHT.min}&&s.lineHeight<=${LINE_HEIGHT.max})r.style.setProperty('--quran-lh',String(s.lineHeight))}catch(e){}})();`;
