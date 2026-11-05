/*
 * The numbers behind the writing goals page: streaks, progress towards a daily goal and towards a
 * manuscript target. Days are calendar dates written "YYYY-MM-DD" in the writer's own time zone,
 * worked out by the server, so nothing here depends on the clock or the zone of the machine.
 */

const DAY_MS = 86_400_000;

/** The number of days since 1970-01-01 for a "YYYY-MM-DD" date. */
export function dayIndex(date: string): number {
  const [y, m, d] = date.split('-').map(Number);
  return Math.round(Date.UTC(y!, m! - 1, d!) / DAY_MS);
}

/** The "YYYY-MM-DD" date `index` days after 1970-01-01. */
export function dateOfIndex(index: number): string {
  return new Date(index * DAY_MS).toISOString().slice(0, 10);
}

export const addDays = (date: string, days: number) => dateOfIndex(dayIndex(date) + days);

export interface WritingDay {
  /** "YYYY-MM-DD". */
  day: string;
  /** Words added minus words removed that day; negative on a day spent cutting. */
  words: number;
}

export interface WritingGoals {
  /** Words to write each day; null for no daily goal. */
  dailyWords: number | null;
  /** Words the manuscript should reach; null for no target. */
  totalWords: number | null;
  /** The date the target is due, "YYYY-MM-DD"; null for none. */
  deadline: string | null;
}

export interface Streaks {
  current: number;
  longest: number;
}

/**
 * How many days in a row the writer met the goal. A day counts when it reached the daily goal,
 * or any words at all when there is no goal. Today does not break a streak until it has ended:
 * a streak that reached yesterday is still current, and today's words extend it.
 */
export function computeStreaks(
  days: readonly WritingDay[],
  dailyWords: number | null,
  today: string,
): Streaks {
  const needed = Math.max(1, dailyWords ?? 1);
  const counted = new Set(days.filter((d) => d.words >= needed).map((d) => dayIndex(d.day)));
  const todayIndex = dayIndex(today);

  let current = 0;
  let cursor = counted.has(todayIndex) ? todayIndex : todayIndex - 1;
  while (counted.has(cursor)) {
    current++;
    cursor--;
  }

  const sorted = [...counted].sort((a, b) => a - b);
  let longest = 0;
  let run = 0;
  let previous = Number.NEGATIVE_INFINITY;
  for (const index of sorted) {
    run = index === previous + 1 ? run + 1 : 1;
    longest = Math.max(longest, run);
    previous = index;
  }
  return { current, longest };
}

export interface ManuscriptProgress {
  words: number;
  target: number;
  /** 0 to 100, one decimal. */
  percent: number;
  /** Whole days left including today; null with no deadline, 0 once the deadline has passed. */
  daysLeft: number | null;
  /** Words a day still needed to make the deadline; null with no deadline or once it has passed. */
  perDayNeeded: number | null;
}

export function manuscriptProgress(
  words: number,
  goals: Pick<WritingGoals, 'totalWords' | 'deadline'>,
  today: string,
): ManuscriptProgress | null {
  if (!goals.totalWords) return null;
  const target = goals.totalWords;
  const percent = Math.min(100, Math.round((words / target) * 1000) / 10);
  let daysLeft: number | null = null;
  let perDayNeeded: number | null = null;
  if (goals.deadline) {
    daysLeft = Math.max(0, dayIndex(goals.deadline) - dayIndex(today) + 1);
    if (daysLeft > 0) perDayNeeded = Math.max(0, Math.ceil((target - words) / daysLeft));
  }
  return { words, target, percent, daysLeft, perDayNeeded };
}

/** How filled in a day looks on the heatmap, 0 (nothing) to 4 (goal reached and beyond). */
export function heatLevel(words: number, dailyWords: number | null): 0 | 1 | 2 | 3 | 4 {
  if (words <= 0) return 0;
  const goal = dailyWords && dailyWords > 0 ? dailyWords : 500;
  const ratio = words / goal;
  if (ratio < 0.34) return 1;
  if (ratio < 0.67) return 2;
  if (ratio < 1) return 3;
  return 4;
}

export interface WritingCell {
  day: string;
  words: number;
  level: 0 | 1 | 2 | 3 | 4;
  /** Before the first day of the window, or after today; drawn blank. */
  blank: boolean;
}

/**
 * Weeks (Monday to Sunday) ending with the one that holds `today`, `weeks` of them, as columns
 * of seven cells for a heatmap. Days with no record count as zero.
 */
export function heatmapWeeks(
  days: readonly WritingDay[],
  dailyWords: number | null,
  today: string,
  weeks: number,
): WritingCell[][] {
  const byDay = new Map(days.map((d) => [d.day, d.words]));
  const todayIndex = dayIndex(today);
  // 1970-01-01 was a Thursday, so index 0 is Thursday; Monday-based weekday = (index + 3) % 7.
  const weekday = (((todayIndex + 3) % 7) + 7) % 7;
  const lastMonday = todayIndex - weekday;
  const firstMonday = lastMonday - (weeks - 1) * 7;
  const out: WritingCell[][] = [];
  for (let w = 0; w < weeks; w++) {
    const column: WritingCell[] = [];
    for (let d = 0; d < 7; d++) {
      const index = firstMonday + w * 7 + d;
      const day = dateOfIndex(index);
      const words = byDay.get(day) ?? 0;
      column.push({ day, words, level: heatLevel(words, dailyWords), blank: index > todayIndex });
    }
    out.push(column);
  }
  return out;
}

/** The words written in the most recent `count` days up to and including today. */
export function wordsInLast(days: readonly WritingDay[], today: string, count: number): number {
  const todayIndex = dayIndex(today);
  return days
    .filter((d) => {
      const index = dayIndex(d.day);
      return index <= todayIndex && index > todayIndex - count;
    })
    .reduce((total, d) => total + Math.max(0, d.words), 0);
}
