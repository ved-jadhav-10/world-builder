import { dateToDay, dayToDate } from './calendar';
import type { CalendarDef } from './schemas/calendar';

/*
 * Calendar reminders: with a "today" set for the world, which dated entries have something
 * coming up. A date still ahead is an event; a date that has passed comes round again each year
 * as an anniversary (a birthday, the day a city fell).
 */

/** One date on an entry, such as its start or its end. */
export interface DatedMoment {
  id: string;
  name: string;
  typeId: string;
  day: number;
  /** What the date is called on this entry's type: "Born", "Fell". */
  label: string;
}

export interface Reminder {
  id: string;
  name: string;
  typeId: string;
  label: string;
  /** The day it falls on next. */
  day: number;
  inDays: number;
  /** False for something still to happen; true when it is the yearly return of a past date. */
  anniversary: boolean;
  /** For an anniversary, how many years since. */
  years: number;
}

/** How far ahead the next anniversary of a date is searched, in case a leap day skips years. */
const YEARS_TO_TRY = 12;

function nextAnniversary(calendar: CalendarDef, original: number, today: number) {
  const from = dayToDate(calendar, original);
  const thisYear = dayToDate(calendar, today).year;
  for (let year = thisYear; year < thisYear + YEARS_TO_TRY; year++) {
    let day: number;
    try {
      day = dateToDay(calendar, { year, month: from.month, day: from.day });
    } catch {
      continue; // that month has no such day this year (a leap day)
    }
    if (day >= today) return { day, years: year - from.year };
  }
  return null;
}

/** Reminders within `withinDays` of `today`, soonest first. */
export function upcomingReminders(
  calendar: CalendarDef,
  moments: readonly DatedMoment[],
  today: number,
  withinDays: number,
): Reminder[] {
  const found: Reminder[] = [];
  for (const moment of moments) {
    const base = {
      id: moment.id,
      name: moment.name,
      typeId: moment.typeId,
      label: moment.label,
    };
    if (moment.day >= today) {
      if (moment.day - today <= withinDays) {
        found.push({
          ...base,
          day: moment.day,
          inDays: moment.day - today,
          anniversary: false,
          years: 0,
        });
      }
      continue;
    }
    const next = nextAnniversary(calendar, moment.day, today);
    if (next && next.years > 0 && next.day - today <= withinDays) {
      found.push({
        ...base,
        day: next.day,
        inDays: next.day - today,
        anniversary: true,
        years: next.years,
      });
    }
  }
  return found.sort((a, b) => a.inDays - b.inDays || a.name.localeCompare(b.name));
}
