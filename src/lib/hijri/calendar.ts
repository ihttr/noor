// Hijri calendar (SPEC §7.18) with Intl's `islamic-umalqura` calendar plus the user's ±2-day
// adjustment. Dates that depend on moon sighting are always labelled "expected" in the UI.

export interface HijriDate {
  year: number;
  month: number;
  day: number;
}

const DAY = 86_400_000;
const parts = new Intl.DateTimeFormat('en-u-ca-islamic-umalqura', { day: 'numeric', month: 'numeric', year: 'numeric', timeZone: 'UTC' });

/** A Gregorian calendar day as a UTC-noon instant (stable across time zones). */
export const civilDay = (year: number, month: number, day: number) => new Date(Date.UTC(year, month - 1, day, 12));

/** Today's civil date on this device, as a UTC-noon instant. */
export function today(now = new Date()): Date {
  return civilDay(now.getFullYear(), now.getMonth() + 1, now.getDate());
}

export const addDays = (d: Date, n: number) => new Date(d.getTime() + n * DAY);

/** The Hijri date of a civil day; `adjust` (−2…+2) moves the Hijri calendar by whole days. */
export function toHijri(day: Date, adjust = 0): HijriDate {
  const p = parts.formatToParts(addDays(day, adjust));
  const get = (type: string) => Number(p.find((x) => x.type === type)?.value);
  return { year: get('year'), month: get('month'), day: get('day') };
}

const same = (a: HijriDate, b: HijriDate) => a.year === b.year && a.month === b.month && a.day === b.day;

/** The civil day of a Hijri date, searched from `from` (days before and after it). */
export function fromHijri(h: HijriDate, adjust = 0, from: Date = civilDay(2000, 1, 1), range = 800): Date | null {
  // Jump close first: a Hijri year is about 354.37 days.
  const here = toHijri(from, adjust);
  const estimate = Math.round((h.year - here.year) * 354.367 + (h.month - here.month) * 29.53 + (h.day - here.day));
  const start = addDays(from, estimate);
  for (let i = 0; i <= range; i++) {
    for (const d of i ? [addDays(start, i), addDays(start, -i)] : [start]) if (same(toHijri(d, adjust), h)) return d;
  }
  return null;
}

/** The civil days of a Hijri month, first to last. */
export function hijriMonthDays(year: number, month: number, adjust = 0, near?: Date): { civil: Date; hijri: HijriDate }[] {
  const first = fromHijri({ year, month, day: 1 }, adjust, near);
  if (!first) return [];
  const days: { civil: Date; hijri: HijriDate }[] = [];
  for (let d = first; ; d = addDays(d, 1)) {
    const h = toHijri(d, adjust);
    if (h.month !== month) break;
    days.push({ civil: d, hijri: h });
  }
  return days;
}

export const nextMonth = (year: number, month: number, step: 1 | -1): { year: number; month: number } =>
  month + step > 12 ? { year: year + 1, month: 1 } : month + step < 1 ? { year: year - 1, month: 12 } : { year, month: month + step };

/** The important dates of SPEC §7.18 (all depend on moon sighting). */
export const EVENTS = [
  { id: 'new-year', month: 1, day: 1 },
  { id: 'ashura', month: 1, day: 10 },
  { id: 'ramadan', month: 9, day: 1 },
  { id: 'eid-fitr', month: 10, day: 1 },
  { id: 'arafah', month: 12, day: 9 },
  { id: 'eid-adha', month: 12, day: 10 },
] as const;
export type EventId = (typeof EVENTS)[number]['id'];

/** The next occurrence of each event on or after `from`, soonest first. */
export function upcomingEvents(from: Date, adjust = 0): { id: EventId; hijri: HijriDate; civil: Date }[] {
  const now = toHijri(from, adjust);
  return EVENTS.map((e) => {
    let hijri = { year: now.year, month: e.month, day: e.day };
    let civil = fromHijri(hijri, adjust, from);
    if (!civil || civil < from) {
      hijri = { ...hijri, year: now.year + 1 };
      civil = fromHijri(hijri, adjust, from);
    }
    return { id: e.id, hijri, civil: civil! };
  })
    .filter((e) => e.civil)
    .sort((a, b) => a.civil.getTime() - b.civil.getTime());
}
