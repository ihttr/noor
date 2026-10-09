// Validation of item references and ids before they are written (SPEC §12: validate input).

import type { ItemType } from './types.ts';

const inRange = (value: string | undefined, min: number, max: number) => {
  const n = Number(value);
  return Number.isInteger(n) && n >= min && n <= max;
};

/** AYAH `2:255`, PAGE `50`, SURAH `18`, DHIKR `morning:3`, TAFSIR `muyassar:2:255`. */
export function isValidItemRef(type: ItemType, ref: string): boolean {
  switch (type) {
    case 'AYAH': {
      const m = /^(\d{1,3}):(\d{1,3})$/.exec(ref);
      return !!m && inRange(m[1], 1, 114) && inRange(m[2], 1, 286);
    }
    case 'PAGE':
      return /^\d{1,3}$/.test(ref) && inRange(ref, 1, 604);
    case 'SURAH':
      return /^\d{1,3}$/.test(ref) && inRange(ref, 1, 114);
    case 'DHIKR':
      return /^[a-z0-9-]{1,40}:\d{1,4}$/.test(ref);
    case 'TAFSIR':
      return /^[a-z0-9-]{1,40}:\d{1,3}:\d{1,3}$/.test(ref);
  }
}

/** RFC 4122 version 4 UUID. `crypto.randomUUID` needs a secure context; LAN testing over plain
 * http does not have one, so fall back to `getRandomValues`, which works everywhere. */
export function uuidv4(): string {
  if (typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  const b = crypto.getRandomValues(new Uint8Array(16));
  b[6] = (b[6]! & 0x0f) | 0x40;
  b[8] = (b[8]! & 0x3f) | 0x80;
  const hex = Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

/** Local calendar day of a timestamp as `YYYY-MM-DD` (reading days are per local day). */
export function localDate(ms: number): string {
  const d = new Date(ms);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export const isValidDate = (date: string) => /^\d{4}-\d{2}-\d{2}$/.test(date);
