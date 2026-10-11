import { describe, expect, it } from 'vitest';
import {
  dateToDay,
  dayToDate,
  daysInMonth,
  DEFAULT_CALENDAR,
  eraOf,
  eraYearToAbsolute,
  formatDate,
  formatSpan,
  formatYear,
  GREGORIAN_CALENDAR as G,
  moonPhase,
  weekdayOf,
  yearLength,
} from './calendar';
import { calendarDefSchema, type CalendarDef } from './schemas/calendar';

const gregorianDay = (year: number, month: number, day: number) =>
  dateToDay(G, { year, month: month - 1, day });

/** A deliberately awkward calendar: uneven months, a leap rule with an offset and exceptions. */
const ODD: CalendarDef = calendarDefSchema.parse({
  months: [
    { name: 'One', days: 36 },
    { name: 'Two', days: 7 },
    { name: 'Three', days: 40 },
    { name: 'Four', days: 11 },
  ],
  weekdays: ['A', 'B', 'C', 'D', 'E'],
  weekdayOffset: 3,
  leapRules: [
    { monthIndex: 3, extraDays: 3, every: 5, offset: 2, skipEvery: 25, restoreEvery: 100 },
    { monthIndex: 0, extraDays: 1, every: 7 },
  ],
});

describe('Gregorian preset matches the real calendar', () => {
  it('knows which years are leap years', () => {
    const feb = (year: number) => daysInMonth(G, year, 1);
    expect([1996, 2000, 2004, 2024, 2400].map(feb)).toEqual([29, 29, 29, 29, 29]);
    expect([1900, 2023, 2100, 2200].map(feb)).toEqual([28, 28, 28, 28]);
    expect(yearLength(G, 2024)).toBe(366);
    expect(yearLength(G, 1900)).toBe(365);
    expect(() => gregorianDay(1900, 2, 29)).toThrow(RangeError);
    expect(() => gregorianDay(2000, 2, 29)).not.toThrow();
  });

  it('counts days between dates correctly', () => {
    // 24 years with six leap years (2000, 04, 08, 12, 16, 20).
    expect(gregorianDay(2024, 1, 1) - gregorianDay(2000, 1, 1)).toBe(24 * 365 + 6);
    expect(gregorianDay(2000, 3, 1) - gregorianDay(2000, 2, 28)).toBe(2);
    expect(gregorianDay(1900, 3, 1) - gregorianDay(1900, 2, 28)).toBe(1);
    expect(gregorianDay(2001, 1, 1) - gregorianDay(2000, 1, 1)).toBe(366);
  });

  it('gets weekdays right', () => {
    const weekday = (y: number, m: number, d: number) =>
      G.weekdays[weekdayOf(G, gregorianDay(y, m, d))];
    expect(weekday(2000, 1, 1)).toBe('Saturday');
    expect(weekday(2024, 2, 29)).toBe('Thursday');
    expect(weekday(1969, 7, 20)).toBe('Sunday');
    expect(weekday(1, 1, 1)).toBe('Monday');
    expect(weekday(1776, 7, 4)).toBe('Thursday');
  });

  it('formats dates with era and weekday', () => {
    const day = gregorianDay(2024, 2, 29);
    expect(formatDate(G, day)).toBe('29 February, 2024 CE');
    expect(formatDate(G, day, { weekday: true })).toBe('Thursday, 29 February, 2024 CE');
    expect(formatYear(G, 0)).toBe('Year 0'); // before the era begins
    expect(formatYear(G, -44)).toBe('Year -44');
    expect(formatSpan(G, gregorianDay(1914, 7, 28), gregorianDay(1918, 11, 11))).toBe(
      '28 July, 1914 CE to 11 November, 1918 CE',
    );
    expect(formatSpan(G, gregorianDay(1914, 7, 28), null)).toBe('28 July, 1914 CE to …');
    expect(formatSpan(G, null, null)).toBe('');
  });
});

describe('converting day numbers and dates', () => {
  const calendars: [string, CalendarDef][] = [
    ['default fantasy', DEFAULT_CALENDAR],
    ['Gregorian', G],
    ['odd', ODD],
  ];

  it.each(calendars)('round-trips every date in a range (%s)', (_name, calendar) => {
    // Plain checks in the loop (a matcher call per day would be slow); one assertion at the end.
    const problems: string[] = [];
    const weekCount = calendar.weekdays.length;
    for (let day = -60_000; day <= 60_000; day++) {
      const date = dayToDate(calendar, day);
      if (dateToDay(calendar, date) !== day) problems.push(`day ${day} did not round-trip`);
      if (date.day < 1 || date.day > daysInMonth(calendar, date.year, date.month)) {
        problems.push(`day ${day} landed on a day that does not exist`);
      }
      // Weekdays advance by one each day and wrap around the week.
      if ((weekdayOf(calendar, day) + 1) % weekCount !== weekdayOf(calendar, day + 1)) {
        problems.push(`weekday jumped after day ${day}`);
      }
      if (problems.length > 5) break;
    }
    expect(problems).toEqual([]);
  });

  it.each(calendars)('handles very distant years (%s)', (_name, calendar) => {
    for (const year of [-99_999, -12_345, -1, 0, 1, 77_777, 99_999]) {
      const first = dateToDay(calendar, { year, month: 0, day: 1 });
      expect(dayToDate(calendar, first)).toMatchObject({ year, month: 0, day: 1 });
      const lastMonth = calendar.months.length - 1;
      const last = dateToDay(calendar, {
        year,
        month: lastMonth,
        day: daysInMonth(calendar, year, lastMonth),
      });
      expect(dayToDate(calendar, last)).toMatchObject({ year, month: lastMonth });
      expect(last - first + 1).toBe(yearLength(calendar, year));
      expect(dayToDate(calendar, last + 1)).toMatchObject({ year: year + 1, month: 0, day: 1 });
    }
  });

  it('puts day 0 at the start of year 0, and day -1 at the end of year -1', () => {
    expect(dayToDate(DEFAULT_CALENDAR, 0)).toMatchObject({ year: 0, month: 0, day: 1 });
    expect(dayToDate(DEFAULT_CALENDAR, -1)).toMatchObject({ year: -1, month: 11, day: 30 });
    expect(dayToDate(G, -1)).toMatchObject({ year: -1, month: 11, day: 31 });
  });

  it('applies leap rules with offsets and exceptions', () => {
    // Rule: every 5 years starting at year 2, except multiples of 25, unless also of 100.
    const leapDays = (year: number) => daysInMonth(ODD, year, 3) - 11;
    expect([2, 7, 12, 17, 22].map(leapDays)).toEqual([3, 3, 3, 3, 3]);
    expect(leapDays(27)).toBe(3); // 27 is not a multiple of 25
    expect([3, 4, 5, 6].map(leapDays)).toEqual([0, 0, 0, 0]);
    // 100 is a multiple of 25 and of 100, but not 2 mod 5, so it is not a leap year here.
    expect(leapDays(100)).toBe(0);
    // Year 2 mod 5 and a multiple of 25 never coincide; use a rule that does.
    const strict = calendarDefSchema.parse({
      months: [{ name: 'M', days: 10 }],
      weekdays: ['X'],
      leapRules: [{ monthIndex: 0, extraDays: 1, every: 4, skipEvery: 100, restoreEvery: 400 }],
    });
    expect([1996, 2000, 1900, 2100, 2400].map((y) => yearLength(strict, y))).toEqual([
      11, 11, 10, 10, 11,
    ]);
  });

  it('refuses dates that do not exist', () => {
    expect(() => dateToDay(DEFAULT_CALENDAR, { year: 1, month: 0, day: 31 })).toThrow(RangeError);
    expect(() => dateToDay(DEFAULT_CALENDAR, { year: 1, month: 0, day: 0 })).toThrow(RangeError);
    expect(() => dateToDay(DEFAULT_CALENDAR, { year: 1, month: 12, day: 1 })).toThrow(RangeError);
    expect(() => dateToDay(DEFAULT_CALENDAR, { year: 1.5, month: 0, day: 1 })).toThrow(RangeError);
  });

  it('works for a calendar with no leap rules and a single month', () => {
    const tiny = calendarDefSchema.parse({
      months: [{ name: 'Only', days: 10 }],
      weekdays: ['One', 'Two'],
    });
    expect(dayToDate(tiny, 25)).toMatchObject({ year: 2, month: 0, day: 6 });
    expect(dateToDay(tiny, { year: -2, month: 0, day: 10 })).toBe(-11);
  });
});

describe('eras', () => {
  const calendar = calendarDefSchema.parse({
    months: [{ name: 'M', days: 10 }],
    weekdays: ['X'],
    eras: [
      { name: 'Second Age', abbreviation: 'SA', startYear: 500 },
      { name: 'First Age', abbreviation: 'FA', startYear: 1 },
      { name: 'No Abbreviation', startYear: 2000 },
    ],
  });

  it('labels each year with the latest era that has begun', () => {
    expect(eraOf(calendar, 0)).toBeNull();
    expect(eraOf(calendar, 1)).toMatchObject({ yearInEra: 1, era: { abbreviation: 'FA' } });
    expect(eraOf(calendar, 499)).toMatchObject({ yearInEra: 499, era: { abbreviation: 'FA' } });
    expect(eraOf(calendar, 500)).toMatchObject({ yearInEra: 1, era: { abbreviation: 'SA' } });
    expect(formatYear(calendar, 742)).toBe('243 SA');
    expect(formatYear(calendar, 2000)).toBe('1 No Abbreviation'); // falls back to the name
  });

  it('turns "year N of an era" back into an absolute year', () => {
    const second = calendar.eras.find((e) => e.abbreviation === 'SA')!;
    expect(eraYearToAbsolute(second, 243)).toBe(742);
    expect(eraOf(calendar, eraYearToAbsolute(second, 243))?.yearInEra).toBe(243);
  });
});

describe('moons', () => {
  const luna = { name: 'Luna', cycleDays: 28, offsetDays: 0 };
  it('follows its cycle', () => {
    expect(moonPhase(luna, 0).name).toBe('New moon');
    expect(moonPhase(luna, 7).name).toBe('First quarter');
    expect(moonPhase(luna, 14).name).toBe('Full moon');
    expect(moonPhase(luna, 21).name).toBe('Last quarter');
    expect(moonPhase(luna, 28).name).toBe('New moon');
    expect(moonPhase(luna, -14).name).toBe('Full moon'); // before day 0 too
    expect(moonPhase({ ...luna, offsetDays: 3 }, 17).name).toBe('Full moon');
  });
});

describe('calendar definitions', () => {
  const base = { months: [{ name: 'M', days: 30 }], weekdays: ['X', 'Y'] };

  it('accepts a minimal calendar and fills in the defaults', () => {
    expect(calendarDefSchema.parse(base)).toMatchObject({
      weekdayOffset: 0,
      leapRules: [],
      eras: [],
      moons: [],
    });
  });

  it('rejects calendars that cannot work', () => {
    const bad: [string, object][] = [
      ['no months', { ...base, months: [] }],
      ['no weekdays', { ...base, weekdays: [] }],
      ['weekday offset past the week', { ...base, weekdayOffset: 2 }],
      ['empty month name', { ...base, months: [{ name: ' ', days: 30 }] }],
      ['a month with no days', { ...base, months: [{ name: 'M', days: 0 }] }],
      [
        'leap rule for a missing month',
        { ...base, leapRules: [{ monthIndex: 3, extraDays: 1, every: 4 }] },
      ],
      [
        'offset not below the interval',
        { ...base, leapRules: [{ monthIndex: 0, extraDays: 1, every: 4, offset: 4 }] },
      ],
      [
        'leap pattern that takes forever to repeat',
        { ...base, leapRules: [{ monthIndex: 0, extraDays: 1, every: 9973, skipEvery: 9967 }] },
      ],
      [
        'two eras starting the same year',
        {
          ...base,
          eras: [
            { name: 'A', startYear: 1 },
            { name: 'B', startYear: 1 },
          ],
        },
      ],
    ];
    for (const [name, calendar] of bad) {
      expect(calendarDefSchema.safeParse(calendar).success, name).toBe(false);
    }
  });

  it('ships presets that pass their own validation', () => {
    expect(calendarDefSchema.safeParse(DEFAULT_CALENDAR).success).toBe(true);
    expect(calendarDefSchema.safeParse(G).success).toBe(true);
  });
});
