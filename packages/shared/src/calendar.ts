import {
  calendarDefSchema,
  leapPeriod,
  type CalendarDef,
  type CalendarDefInput,
  type Era,
  type LeapRule,
  type Moon,
} from './schemas/calendar';

/*
 * Every in-world date is stored as a day number: day 0 is the first day of year 0, and years
 * before it are negative. These functions turn that number into a year, month and day for any
 * calendar (any months, leap rules and eras), and back. Years are "absolute" here; an era only
 * changes how a year is labelled.
 */

export interface DateParts {
  /** Absolute year; can be zero or negative. */
  year: number;
  /** Zero-based index into the calendar's months. */
  month: number;
  /** One-based day of the month. */
  day: number;
}

const mod = (a: number, b: number) => ((a % b) + b) % b;

interface Compiled {
  baseYearDays: number;
  /** Per leap rule: years in one repeat, leap years in one repeat, and a running count. */
  leaps: { rule: LeapRule; period: number; perPeriod: number; before: Uint32Array }[];
  averageYearDays: number;
}

const compiled = new WeakMap<CalendarDef, Compiled>();

function isLeap(rule: LeapRule, year: number): boolean {
  if (mod(year, rule.every) !== rule.offset) return false;
  if (rule.skipEvery && mod(year, rule.skipEvery) === 0) {
    return Boolean(rule.restoreEvery && mod(year, rule.restoreEvery) === 0);
  }
  return true;
}

function compile(calendar: CalendarDef): Compiled {
  const cached = compiled.get(calendar);
  if (cached) return cached;
  const baseYearDays = calendar.months.reduce((sum, m) => sum + m.days, 0);
  const leaps = calendar.leapRules.map((rule) => {
    const period = leapPeriod(rule);
    // before[r] = leap years among years 0 .. r-1, for r up to one full repeat.
    const before = new Uint32Array(period + 1);
    for (let year = 0; year < period; year++) {
      before[year + 1] = before[year]! + (isLeap(rule, year) ? 1 : 0);
    }
    return { rule, period, perPeriod: before[period]!, before };
  });
  const averageYearDays =
    baseYearDays + leaps.reduce((sum, l) => sum + (l.rule.extraDays * l.perPeriod) / l.period, 0);
  const result = { baseYearDays, leaps, averageYearDays };
  compiled.set(calendar, result);
  return result;
}

/** Leap years from year 0 up to (not including) `year`; negative for earlier years. */
function leapYearsBefore(leap: Compiled['leaps'][number], year: number): number {
  const repeats = Math.floor(year / leap.period);
  return repeats * leap.perPeriod + leap.before[year - repeats * leap.period]!;
}

function daysBeforeYear(calendar: CalendarDef, year: number): number {
  const c = compile(calendar);
  let days = year * c.baseYearDays;
  for (const leap of c.leaps) days += leap.rule.extraDays * leapYearsBefore(leap, year);
  return days;
}

export function yearLength(calendar: CalendarDef, year: number): number {
  const c = compile(calendar);
  return c.leaps.reduce(
    (sum, l) => sum + (isLeap(l.rule, year) ? l.rule.extraDays : 0),
    c.baseYearDays,
  );
}

export function daysInMonth(calendar: CalendarDef, year: number, month: number): number {
  const base = calendar.months[month]?.days ?? 0;
  return calendar.leapRules.reduce(
    (sum, rule) => sum + (rule.monthIndex === month && isLeap(rule, year) ? rule.extraDays : 0),
    base,
  );
}

/** The day number of a date. Throws if the month or day doesn't exist that year. */
export function dateToDay(calendar: CalendarDef, { year, month, day }: DateParts): number {
  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) {
    throw new RangeError('Year, month and day must be whole numbers');
  }
  if (month < 0 || month >= calendar.months.length) throw new RangeError('No such month');
  if (day < 1 || day > daysInMonth(calendar, year, month)) {
    throw new RangeError(`${calendar.months[month]!.name} has no day ${day} in year ${year}`);
  }
  let dayOfYear = day - 1;
  for (let m = 0; m < month; m++) dayOfYear += daysInMonth(calendar, year, m);
  return daysBeforeYear(calendar, year) + dayOfYear;
}

function yearOfDay(calendar: CalendarDef, day: number): number {
  let year = Math.floor(day / compile(calendar).averageYearDays);
  // The estimate is within a year or so of the answer; settle it exactly.
  while (daysBeforeYear(calendar, year) > day) year--;
  while (daysBeforeYear(calendar, year + 1) <= day) year++;
  return year;
}

export function dayToDate(calendar: CalendarDef, day: number): DateParts & { dayOfYear: number } {
  const year = yearOfDay(calendar, day);
  const dayOfYear = day - daysBeforeYear(calendar, year);
  let remaining = dayOfYear;
  for (let month = 0; month < calendar.months.length; month++) {
    const length = daysInMonth(calendar, year, month);
    if (remaining < length) return { year, month, day: remaining + 1, dayOfYear };
    remaining -= length;
  }
  // Unreachable: the year's length is the sum of its months.
  throw new RangeError('Day is outside its year');
}

/** Index into `weekdays` for a day number. */
export function weekdayOf(calendar: CalendarDef, day: number): number {
  return mod(day + calendar.weekdayOffset, calendar.weekdays.length);
}

// ---- Eras ----------------------------------------------------------------------------------

/** The era a year falls in (the latest one that has started), and the year's number within it. */
export function eraOf(
  calendar: CalendarDef,
  year: number,
): { era: Era; index: number; yearInEra: number } | null {
  let best: { era: Era; index: number } | null = null;
  calendar.eras.forEach((era, index) => {
    if (era.startYear <= year && (!best || era.startYear > best.era.startYear)) {
      best = { era, index };
    }
  });
  const found = best as { era: Era; index: number } | null;
  return found ? { ...found, yearInEra: year - found.era.startYear + 1 } : null;
}

/** The absolute year for "year N of this era". */
export const eraYearToAbsolute = (era: Era, yearInEra: number) => era.startYear + yearInEra - 1;

export const eraLabel = (era: Era) => era.abbreviation || era.name;

/** "342 TA" with eras, "Year 342" without. */
export function formatYear(calendar: CalendarDef, year: number): string {
  const found = eraOf(calendar, year);
  return found ? `${found.yearInEra} ${eraLabel(found.era)}` : `Year ${year}`;
}

export function formatDate(
  calendar: CalendarDef,
  day: number,
  options: { weekday?: boolean } = {},
): string {
  const date = dayToDate(calendar, day);
  const text = `${date.day} ${calendar.months[date.month]!.name}, ${formatYear(calendar, date.year)}`;
  return options.weekday ? `${calendar.weekdays[weekdayOf(calendar, day)]}, ${text}` : text;
}

/** A period like "342 TA to 380 TA"; open ends read "…" . */
export function formatSpan(calendar: CalendarDef, from: number | null, to: number | null): string {
  if (from === null && to === null) return '';
  const start = from === null ? '…' : formatDate(calendar, from);
  const end = to === null ? '…' : formatDate(calendar, to);
  return `${start} to ${end}`;
}

// ---- Moons ---------------------------------------------------------------------------------

const PHASES = [
  'New moon',
  'Waxing crescent',
  'First quarter',
  'Waxing gibbous',
  'Full moon',
  'Waning gibbous',
  'Last quarter',
  'Waning crescent',
] as const;

/** How far through its cycle a moon is on a day (0 = new, 0.5 = full), and the phase's name. */
export function moonPhase(
  moon: Moon,
  day: number,
): { cycle: number; name: (typeof PHASES)[number] } {
  const cycle = mod(day - moon.offsetDays, moon.cycleDays) / moon.cycleDays;
  return { cycle, name: PHASES[Math.round(cycle * PHASES.length) % PHASES.length]! };
}

// ---- Presets -------------------------------------------------------------------------------

/** Presets go through the schema, which fills in defaults and checks them at load. */
const preset = (calendar: CalendarDefInput): CalendarDef => calendarDefSchema.parse(calendar);

/** The calendar every new world starts with: twelve even months, a seven-day week, one moon. */
export const DEFAULT_CALENDAR = preset({
  months: [
    'Frostmoon',
    'Thawmoon',
    'Seedtide',
    'Bloomtide',
    'Greenwane',
    'Highsun',
    'Sunpeak',
    'Harvestmoon',
    'Amberfall',
    'Rimewane',
    'Duskmoon',
    'Yuletide',
  ].map((name) => ({ name, days: 30 })),
  weekdays: ['Moonday', 'Fireday', 'Waterday', 'Earthday', 'Windday', 'Starday', 'Sunday'],
  eras: [{ name: 'Age of Founding', abbreviation: 'AF', startYear: 1 }],
  moons: [{ name: 'Luna', cycleDays: 28, offsetDays: 0 }],
});

/** Earth's Gregorian calendar, extended backwards. Day 0 is 1 January of year 0, a Saturday. */
export const GREGORIAN_CALENDAR = preset({
  months: [
    ['January', 31],
    ['February', 28],
    ['March', 31],
    ['April', 30],
    ['May', 31],
    ['June', 30],
    ['July', 31],
    ['August', 31],
    ['September', 30],
    ['October', 31],
    ['November', 30],
    ['December', 31],
  ].map(([name, days]) => ({ name: name as string, days: days as number })),
  weekdays: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'],
  weekdayOffset: 5,
  leapRules: [{ monthIndex: 1, extraDays: 1, every: 4, skipEvery: 100, restoreEvery: 400 }],
  eras: [{ name: 'Common Era', abbreviation: 'CE', startYear: 1 }],
  moons: [{ name: 'Moon', cycleDays: 29.530588, offsetDays: 6.5 }],
});

export const CALENDAR_PRESETS = [
  { key: 'fantasy', name: 'Fantasy world', calendar: DEFAULT_CALENDAR },
  { key: 'gregorian', name: 'Earth (Gregorian)', calendar: GREGORIAN_CALENDAR },
] as const;
