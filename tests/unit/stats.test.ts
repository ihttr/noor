import { describe, expect, it } from 'vitest';
import {
  addDays,
  daysBetween,
  firstDayOfWeek,
  goalOn,
  heatLevel,
  heatmap,
  indexDays,
  monthStart,
  period,
  streak,
  surahsCompleted,
  weekStart,
  weekday,
} from '@/lib/stats/stats';
import type { ReadingDayRecord } from '@/lib/store/types';

const day = (date: string, pages: number[], seconds = 60): ReadingDayRecord => ({
  id: date,
  createdAt: 0,
  updatedAt: 0,
  deletedAt: null,
  date,
  pagesRead: pages,
  secondsRead: seconds,
});

describe('dates', () => {
  it('adds days across months, years and leap days', () => {
    expect(addDays('2026-10-09', 1)).toBe('2026-10-10');
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDays('2028-03-01', -1)).toBe('2028-02-29');
    expect(daysBetween('2026-10-01', '2026-10-09')).toBe(9);
  });

  it('weeks start on the locale’s first day', () => {
    expect(weekday('2026-10-09')).toBe(5); // a Friday
    expect(weekStart('2026-10-09', 6)).toBe('2026-10-03'); // Saturday
    expect(weekStart('2026-10-09', 7)).toBe('2026-10-04'); // Sunday
    expect(weekStart('2026-10-09', 1)).toBe('2026-10-05'); // Monday
    expect(weekStart('2026-10-03', 6)).toBe('2026-10-03');
    expect(monthStart('2026-10-09')).toBe('2026-10-01');
    expect(firstDayOfWeek('ar')).toBe(6);
    expect(firstDayOfWeek('en')).toBe(7);
  });
});

describe('goals and progress (SPEC §7.13)', () => {
  const goals = [
    { activeFrom: '2026-10-01', amount: 5 },
    { activeFrom: '2026-10-05', amount: 10 },
  ];

  it('the goal of a day is the latest one started on or before it', () => {
    expect(goalOn(goals, '2026-09-30')).toBe(0);
    expect(goalOn(goals, '2026-10-04')).toBe(5);
    expect(goalOn(goals, '2026-10-09')).toBe(10);
  });

  it('period totals: pages, goal so far, days read, seconds', () => {
    const days = indexDays([day('2026-10-03', [1, 2]), day('2026-10-05', [3, 4, 5], 600), day('2026-10-06', [])]);
    expect(period(days, goals, '2026-10-03', '2026-10-06')).toEqual({
      from: '2026-10-03',
      to: '2026-10-06',
      pages: 5,
      goal: 5 + 5 + 10 + 10,
      daysRead: 2,
      days: 4,
      seconds: 60 + 600 + 60,
    });
  });

  it('streak counts up to today, or up to yesterday while today is still empty', () => {
    const days = indexDays([day('2026-10-06', [1]), day('2026-10-07', [2]), day('2026-10-08', [3])]);
    expect(streak(days, '2026-10-08')).toBe(3);
    expect(streak(days, '2026-10-09')).toBe(3);
    expect(streak(days, '2026-10-10')).toBe(0);
    expect(streak(indexDays([]), '2026-10-10')).toBe(0);
  });

  it('a surah is completed when every page it is on was read', () => {
    const ranges: [number, number][] = [
      [1, 1],
      [2, 49],
      [604, 604],
    ];
    const pages = [day('2026-10-01', [1, 604]), day('2026-10-02', Array.from({ length: 47 }, (_, i) => i + 2))];
    expect(surahsCompleted(pages, ranges)).toBe(2);
    expect(surahsCompleted([...pages, day('2026-10-03', [49])], ranges)).toBe(3);
  });

  it('heatmap: weeks of 7 days ending with today, levels by goal', () => {
    expect([heatLevel(0, 5), heatLevel(1, 5), heatLevel(2, 5), heatLevel(4, 5), heatLevel(5, 5)]).toEqual([0, 1, 2, 3, 4]);
    expect([heatLevel(2, 0), heatLevel(3, 0), heatLevel(6, 0), heatLevel(11, 0)]).toEqual([1, 2, 3, 4]);
    const grid = heatmap(indexDays([day('2026-10-09', [1, 2, 3, 4, 5])]), goals, '2026-10-09', 4, 6);
    expect(grid).toHaveLength(4);
    expect(grid.every((w) => w.length === 7)).toBe(true);
    expect(grid[0]![0]!.date).toBe('2026-09-12');
    const today = grid[3]!.find((c) => c.date === '2026-10-09')!;
    expect(today).toMatchObject({ pages: 5, level: 2, future: false });
    expect(grid[3]!.at(-1)).toMatchObject({ date: '2026-10-09', future: false });
  });
});
