import { describe, expect, it } from 'vitest';
import { addDays, civilDay, fromHijri, hijriMonthDays, nextMonth, toHijri, upcomingEvents } from '@/lib/hijri/calendar';

describe('Hijri calendar (SPEC §7.18)', () => {
  // Reference: the Diyanet page read on 2026-10-09 lists 09.10.2026 as 28 Rebiulahir 1448.
  it('converts with the Umm al-Qura calendar', () => {
    expect(toHijri(civilDay(2026, 10, 9))).toEqual({ year: 1448, month: 4, day: 28 });
  });

  it('applies the ±2 day adjustment', () => {
    expect(toHijri(civilDay(2026, 10, 9), 1)).toEqual({ year: 1448, month: 4, day: 29 });
    expect(toHijri(civilDay(2026, 10, 9), -2)).toEqual({ year: 1448, month: 4, day: 26 });
  });

  it('finds the civil day of a Hijri date and round-trips', () => {
    const d = fromHijri({ year: 1447, month: 9, day: 1 }, 0, civilDay(2026, 1, 1))!;
    expect(d.toISOString().slice(0, 10)).toBe('2026-02-18');
    for (const adjust of [-1, 0, 2]) {
      const civil = fromHijri({ year: 1448, month: 12, day: 10 }, adjust, civilDay(2026, 10, 9))!;
      expect(toHijri(civil, adjust)).toEqual({ year: 1448, month: 12, day: 10 });
    }
  });

  it('builds a month of 29 or 30 days', () => {
    const days = hijriMonthDays(1448, 4, 0, civilDay(2026, 10, 9));
    expect([29, 30]).toContain(days.length);
    expect(days[0]!.hijri.day).toBe(1);
    expect(days.at(-1)!.hijri.day).toBe(days.length);
    expect(addDays(days[0]!.civil, days.length - 1).getTime()).toBe(days.at(-1)!.civil.getTime());
    expect(nextMonth(1448, 12, 1)).toEqual({ year: 1449, month: 1 });
    expect(nextMonth(1448, 1, -1)).toEqual({ year: 1447, month: 12 });
  });

  it('lists the six important dates, soonest first, all in the future', () => {
    const from = civilDay(2026, 10, 9);
    const events = upcomingEvents(from);
    expect(events.map((e) => e.id).sort()).toEqual(['arafah', 'ashura', 'eid-adha', 'eid-fitr', 'new-year', 'ramadan']);
    expect(events.every((e) => e.civil >= from)).toBe(true);
    expect(events.map((e) => e.civil.getTime())).toEqual([...events.map((e) => e.civil.getTime())].sort((a, b) => a - b));
    const ramadan = events.find((e) => e.id === 'ramadan')!;
    expect(toHijri(ramadan.civil)).toEqual({ year: 1448, month: 9, day: 1 });
  });
});
