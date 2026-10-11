import { dateToDay, dayToDate, formatYear, yearLength, type CalendarDef } from '@atlas/shared';

/** Space kept between neighbouring items in a row, in pixels. */
const GAP = 8;
/** The least width an item takes, so a single moment is still a visible mark. */
export const MIN_ITEM_WIDTH = 10;

export interface PackInput {
  id: string;
  /** First and last day; equal for a single moment. */
  from: number;
  to: number;
  /** Pixels the item's label needs beside or inside it. */
  labelWidth: number;
}

/**
 * Stacks items into rows so none overlap at this zoom. Each item takes its bar plus its label,
 * and goes in the first row with room. Rows are numbered from 0.
 */
export function packRows(
  inputs: readonly PackInput[],
  pxPerDay: number,
): { rowOf: Map<string, number>; rowCount: number } {
  const sorted = [...inputs].sort(
    (a, b) => a.from - b.from || a.to - b.to || a.id.localeCompare(b.id),
  );
  const rowEnds: number[] = [];
  const rowOf = new Map<string, number>();
  for (const item of sorted) {
    const left = item.from * pxPerDay;
    const bar = Math.max(item.to * pxPerDay, left + MIN_ITEM_WIDTH);
    const right = Math.max(bar, left + item.labelWidth) + GAP;
    let row = rowEnds.findIndex((end) => end <= left);
    if (row === -1) row = rowEnds.length;
    rowEnds[row] = right;
    rowOf.set(item.id, row);
  }
  return { rowOf, rowCount: rowEnds.length };
}

export interface Tick {
  day: number;
  label: string;
  /** Year marks are major; month marks are minor. */
  major: boolean;
}

const NICE_STEPS = [
  1, 2, 5, 10, 20, 50, 100, 200, 500, 1000, 2000, 5000, 10_000, 20_000, 50_000, 100_000,
];
const MAX_TICKS = 500;

/**
 * Tick marks for the visible days: whole years at a "nice" interval (every 5 years, every 100…)
 * so labels stay at least `minSpacing` pixels apart, plus month marks once zoomed in far enough.
 */
export function buildTicks(
  calendar: CalendarDef,
  firstDay: number,
  lastDay: number,
  pxPerDay: number,
  minSpacing = 96,
): Tick[] {
  if (!(lastDay > firstDay) || !(pxPerDay > 0)) return [];
  const firstYear = dayToDate(calendar, Math.floor(firstDay)).year;
  const lastYear = dayToDate(calendar, Math.ceil(lastDay)).year;
  const yearDays = yearLength(calendar, 0);
  const pxPerYear = pxPerDay * yearDays;
  const step = NICE_STEPS.find((s) => s * pxPerYear >= minSpacing) ?? NICE_STEPS.at(-1)!;

  const ticks: Tick[] = [];
  for (let year = Math.ceil(firstYear / step) * step; year <= lastYear + 1; year += step) {
    if (ticks.length >= MAX_TICKS) break;
    ticks.push({
      day: dateToDay(calendar, { year, month: 0, day: 1 }),
      label: formatYear(calendar, year),
      major: true,
    });
  }

  // Months are worth marking once a month is wide enough to read.
  const monthDays = yearDays / Math.max(1, calendar.months.length);
  if (step === 1 && monthDays * pxPerDay >= 44 && lastYear - firstYear <= 40) {
    for (let year = firstYear; year <= lastYear; year++) {
      for (let month = 1; month < calendar.months.length; month++) {
        ticks.push({
          day: dateToDay(calendar, { year, month, day: 1 }),
          label: calendar.months[month]!.name,
          major: false,
        });
      }
    }
  }
  return ticks.filter((t) => t.day >= firstDay - yearDays && t.day <= lastDay + yearDays);
}

/** A zoom and pan that frames [first, last] in `width` pixels, with a little room either side. */
export function fitView(first: number, last: number, width: number) {
  const span = Math.max(last - first, 30); // never zoom in tighter than a month or so
  const pxPerDay = width / (span * 1.12);
  return { pxPerDay, startDay: first - span * 0.06 };
}
