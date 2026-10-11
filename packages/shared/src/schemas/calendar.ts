import { z } from 'zod';

/** Day numbers count from the first day of year 0, and can be negative (before it). */
export const MAX_DAY = 1_000_000_000;
export const dayNumberSchema = z.number().int().min(-MAX_DAY).max(MAX_DAY);

/** How many years the leap pattern takes to repeat; kept small so conversions stay quick. */
export const MAX_LEAP_PERIOD = 100_000;

export const monthSchema = z.object({
  name: z.string().trim().min(1, 'Name is required').max(40),
  days: z.number().int().min(1, 'At least 1 day').max(400),
});

/**
 * Adds `extraDays` to one month in the years that "leap". A year leaps when it is a multiple of
 * `every` (plus `offset`), except multiples of `skipEvery`, unless also a multiple of `restoreEvery`.
 * Earth's rule is every 4, skip 100, restore 400.
 */
export const leapRuleSchema = z.object({
  monthIndex: z.number().int().min(0).max(59),
  extraDays: z.number().int().min(1).max(100),
  every: z.number().int().min(2).max(10_000),
  offset: z.number().int().min(0).max(9_999).default(0),
  skipEvery: z.number().int().min(2).max(10_000).nullable().default(null),
  restoreEvery: z.number().int().min(2).max(10_000).nullable().default(null),
});
export type LeapRule = z.infer<typeof leapRuleSchema>;

/** `startYear` is the year that counts as year 1 of the era. */
export const eraSchema = z.object({
  name: z.string().trim().min(1, 'Name is required').max(60),
  abbreviation: z.string().trim().max(10).default(''),
  startYear: z.number().int().min(-100_000).max(100_000),
});
export type Era = z.infer<typeof eraSchema>;

export const moonSchema = z.object({
  name: z.string().trim().min(1, 'Name is required').max(40),
  /** Days from one new moon to the next. May be fractional, like 29.53. */
  cycleDays: z.number().min(2).max(100_000),
  /** The day number of a new moon. */
  offsetDays: z.number().min(-MAX_DAY).max(MAX_DAY).default(0),
});
export type Moon = z.infer<typeof moonSchema>;

const gcd = (a: number, b: number): number => (b === 0 ? a : gcd(b, a % b));
const lcm = (a: number, b: number) => (a / gcd(a, b)) * b;

/** Years until a leap rule's pattern repeats. */
export function leapPeriod(rule: Pick<LeapRule, 'every' | 'skipEvery' | 'restoreEvery'>): number {
  return lcm(lcm(rule.every, rule.skipEvery ?? 1), rule.restoreEvery ?? 1);
}

export const calendarDefSchema = z
  .object({
    months: z.array(monthSchema).min(1, 'Add at least one month').max(60),
    weekdays: z.array(z.string().trim().min(1, 'Name is required').max(40)).min(1).max(30),
    /** Which weekday day 0 falls on, as an index into `weekdays`. */
    weekdayOffset: z.number().int().min(0).default(0),
    leapRules: z.array(leapRuleSchema).max(5).default([]),
    eras: z.array(eraSchema).max(20).default([]),
    moons: z.array(moonSchema).max(6).default([]),
  })
  .superRefine((calendar, ctx) => {
    if (calendar.weekdayOffset >= calendar.weekdays.length) {
      ctx.addIssue({
        code: 'custom',
        path: ['weekdayOffset'],
        message: 'Pick one of the weekdays',
      });
    }
    calendar.leapRules.forEach((rule, i) => {
      if (rule.monthIndex >= calendar.months.length) {
        ctx.addIssue({
          code: 'custom',
          path: ['leapRules', i, 'monthIndex'],
          message: 'Pick one of the months',
        });
      }
      if (rule.offset >= rule.every) {
        ctx.addIssue({
          code: 'custom',
          path: ['leapRules', i, 'offset'],
          message: 'Must be less than the repeat interval',
        });
      }
      if (leapPeriod(rule) > MAX_LEAP_PERIOD) {
        ctx.addIssue({
          code: 'custom',
          path: ['leapRules', i, 'every'],
          message: 'These intervals take too long to repeat; use smaller numbers',
        });
      }
    });
    const starts = calendar.eras.map((era) => era.startYear);
    if (new Set(starts).size !== starts.length) {
      ctx.addIssue({
        code: 'custom',
        path: ['eras'],
        message: 'Two eras cannot start in the same year',
      });
    }
  });
export type CalendarDef = z.infer<typeof calendarDefSchema>;
export type CalendarDefInput = z.input<typeof calendarDefSchema>;

export const calendarUpdateSchema = z.object({
  name: z.string().trim().min(1, 'Name is required').max(80),
  definition: calendarDefSchema,
});
export type CalendarUpdateInput = z.input<typeof calendarUpdateSchema>;
