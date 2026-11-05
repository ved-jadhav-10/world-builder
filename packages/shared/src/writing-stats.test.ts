import { describe, expect, it } from 'vitest';
import {
  addDays,
  computeStreaks,
  dateOfIndex,
  dayIndex,
  heatLevel,
  heatmapWeeks,
  manuscriptProgress,
  wordsInLast,
  type WritingDay,
} from './writing-stats';

const days = (entries: Record<string, number>): WritingDay[] =>
  Object.entries(entries).map(([day, words]) => ({ day, words }));

describe('dates', () => {
  it('converts to day numbers and back, across month, year and leap days', () => {
    expect(dayIndex('1970-01-01')).toBe(0);
    expect(dateOfIndex(0)).toBe('1970-01-01');
    expect(addDays('2024-02-28', 1)).toBe('2024-02-29');
    expect(addDays('2024-02-29', 1)).toBe('2024-03-01');
    expect(addDays('2023-12-31', 1)).toBe('2024-01-01');
    expect(addDays('2026-01-01', -1)).toBe('2025-12-31');
    expect(dayIndex('2026-03-02') - dayIndex('2026-02-28')).toBe(2);
  });
});

describe('computeStreaks', () => {
  it('counts consecutive days that reached the goal, ending today', () => {
    const data = days({ '2026-03-01': 600, '2026-03-02': 550, '2026-03-03': 800 });
    expect(computeStreaks(data, 500, '2026-03-03')).toEqual({ current: 3, longest: 3 });
  });

  it('keeps yesterday’s streak alive until today has ended', () => {
    const data = days({ '2026-03-01': 600, '2026-03-02': 550 });
    expect(computeStreaks(data, 500, '2026-03-03')).toEqual({ current: 2, longest: 2 });
    // The day after that with nothing written, it is broken.
    expect(computeStreaks(data, 500, '2026-03-04')).toEqual({ current: 0, longest: 2 });
  });

  it('does not count a day short of the goal, and finds the longest run in the past', () => {
    const data = days({
      '2026-02-01': 500,
      '2026-02-02': 500,
      '2026-02-03': 500,
      '2026-02-04': 100,
      '2026-02-05': 500,
    });
    expect(computeStreaks(data, 500, '2026-02-05')).toEqual({ current: 1, longest: 3 });
  });

  it('counts any writing at all when there is no daily goal, but not cutting', () => {
    const data = days({ '2026-03-01': 1, '2026-03-02': 40, '2026-03-03': -200, '2026-03-04': 0 });
    expect(computeStreaks(data, null, '2026-03-02')).toEqual({ current: 2, longest: 2 });
    expect(computeStreaks(data, null, '2026-03-04')).toEqual({ current: 0, longest: 2 });
  });

  it('is zero with no days at all', () => {
    expect(computeStreaks([], 500, '2026-03-03')).toEqual({ current: 0, longest: 0 });
  });

  it('handles a streak that spans a month and a year boundary', () => {
    const data = days({ '2025-12-30': 10, '2025-12-31': 10, '2026-01-01': 10, '2026-01-02': 10 });
    expect(computeStreaks(data, null, '2026-01-02')).toEqual({ current: 4, longest: 4 });
  });
});

describe('manuscriptProgress', () => {
  it('is nothing without a target', () => {
    expect(manuscriptProgress(5000, { totalWords: null, deadline: null }, '2026-03-01')).toBeNull();
  });

  it('gives a percentage, capped at 100', () => {
    expect(
      manuscriptProgress(25_000, { totalWords: 80_000, deadline: null }, '2026-03-01'),
    ).toMatchObject({ percent: 31.3, daysLeft: null, perDayNeeded: null });
    expect(
      manuscriptProgress(90_000, { totalWords: 80_000, deadline: null }, '2026-03-01')!.percent,
    ).toBe(100);
  });

  it('works out the pace needed to make a deadline, counting today', () => {
    const progress = manuscriptProgress(
      20_000,
      { totalWords: 80_000, deadline: '2026-03-30' },
      '2026-03-01',
    )!;
    expect(progress.daysLeft).toBe(30);
    expect(progress.perDayNeeded).toBe(2000);
  });

  it('rounds the pace up, and says nothing is needed once the target is met', () => {
    expect(
      manuscriptProgress(0, { totalWords: 1000, deadline: '2026-03-03' }, '2026-03-01')!
        .perDayNeeded,
    ).toBe(334);
    expect(
      manuscriptProgress(1200, { totalWords: 1000, deadline: '2026-03-03' }, '2026-03-01')!
        .perDayNeeded,
    ).toBe(0);
  });

  it('has no pace once the deadline has passed, and counts the deadline day itself', () => {
    const late = manuscriptProgress(
      10,
      { totalWords: 1000, deadline: '2026-02-28' },
      '2026-03-01',
    )!;
    expect(late).toMatchObject({ daysLeft: 0, perDayNeeded: null });
    const last = manuscriptProgress(
      10,
      { totalWords: 1000, deadline: '2026-03-01' },
      '2026-03-01',
    )!;
    expect(last).toMatchObject({ daysLeft: 1, perDayNeeded: 990 });
  });
});

describe('heatmap', () => {
  it('shades a day by how close it came to the goal', () => {
    expect(heatLevel(0, 500)).toBe(0);
    expect(heatLevel(-30, 500)).toBe(0);
    expect(heatLevel(50, 500)).toBe(1);
    expect(heatLevel(250, 500)).toBe(2);
    expect(heatLevel(400, 500)).toBe(3);
    expect(heatLevel(500, 500)).toBe(4);
    expect(heatLevel(2000, 500)).toBe(4);
    // Without a goal, 500 words is a full day.
    expect(heatLevel(500, null)).toBe(4);
  });

  it('lays out whole Monday-to-Sunday weeks ending with this one', () => {
    // 2026-03-04 is a Wednesday.
    const weeks = heatmapWeeks(
      days({ '2026-03-04': 600, '2026-03-02': 100 }),
      500,
      '2026-03-04',
      3,
    );
    expect(weeks).toHaveLength(3);
    expect(weeks.every((w) => w.length === 7)).toBe(true);
    const last = weeks[2]!;
    expect(last[0]!.day).toBe('2026-03-02');
    expect(last[0]).toMatchObject({ words: 100, level: 1, blank: false });
    expect(last[2]).toMatchObject({ day: '2026-03-04', words: 600, level: 4, blank: false });
    // Thursday to Sunday have not happened yet.
    expect(last.slice(3).every((c) => c.blank)).toBe(true);
    expect(weeks[0]![0]!.day).toBe('2026-02-16');
  });

  it('starts on a Monday whatever day today is', () => {
    for (const today of ['2026-03-01', '2026-03-02', '2026-03-08', '2024-02-29']) {
      const weeks = heatmapWeeks([], null, today, 2);
      const monday = weeks[1]![0]!.day;
      expect(new Date(monday + 'T00:00:00Z').getUTCDay()).toBe(1);
      expect(weeks.flat().some((c) => c.day === today)).toBe(true);
    }
  });
});

describe('wordsInLast', () => {
  it('adds the words of the last few days, ignoring days spent cutting and future days', () => {
    const data = days({
      '2026-03-01': 300,
      '2026-03-02': -100,
      '2026-03-03': 200,
      '2026-03-05': 999,
      '2026-02-20': 5000,
    });
    expect(wordsInLast(data, '2026-03-03', 7)).toBe(500);
    expect(wordsInLast(data, '2026-03-03', 1)).toBe(200);
  });
});
