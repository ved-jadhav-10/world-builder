import { describe, expect, it } from 'vitest';
import { dateToDay, DEFAULT_CALENDAR, GREGORIAN_CALENDAR } from './calendar';
import { upcomingReminders, type DatedMoment } from './reminders';

const cal = DEFAULT_CALENDAR; // twelve months of thirty days
const day = (year: number, month: number, d: number) =>
  dateToDay(cal, { year, month: month - 1, day: d });
const moment = (id: string, at: number, label = 'Born'): DatedMoment => ({
  id,
  name: id,
  typeId: 't',
  day: at,
  label,
});

describe('upcomingReminders', () => {
  const today = day(300, 4, 10);

  it('lists dates still to come within the window, soonest first', () => {
    const list = upcomingReminders(
      cal,
      [moment('far', day(300, 9, 1)), moment('soon', day(300, 4, 15)), moment('today', today)],
      today,
      30,
    );
    expect(list.map((r) => [r.id, r.inDays, r.anniversary])).toEqual([
      ['today', 0, false],
      ['soon', 5, false],
    ]);
  });

  it('brings a past date back each year as an anniversary, with its age', () => {
    const [r] = upcomingReminders(cal, [moment('born', day(250, 4, 20))], today, 30);
    expect(r).toMatchObject({ anniversary: true, years: 50, inDays: 10, day: day(300, 4, 20) });
  });

  it('rolls an anniversary that already went by this year into next year', () => {
    const late = day(300, 12, 28);
    const [r] = upcomingReminders(cal, [moment('born', day(290, 1, 5))], late, 30);
    expect(r).toMatchObject({ anniversary: true, years: 11, day: day(301, 1, 5) });
  });

  it('does not count the day itself as its own anniversary', () => {
    expect(upcomingReminders(cal, [moment('x', day(300, 4, 10))], today, 30)).toHaveLength(1);
    expect(upcomingReminders(cal, [moment('x', today)], today, 30)[0]!.anniversary).toBe(false);
  });

  it('skips years when a leap day does not exist, and ignores what is out of range', () => {
    const greg = GREGORIAN_CALENDAR;
    const leapDay = dateToDay(greg, { year: 2000, month: 1, day: 29 });
    const feb = dateToDay(greg, { year: 2025, month: 1, day: 20 });
    const [r] = upcomingReminders(greg, [moment('leap', leapDay)], feb, 2000);
    expect(r).toMatchObject({ anniversary: true, years: 28 });
    expect(upcomingReminders(greg, [moment('leap', leapDay)], feb, 10)).toEqual([]);
  });
});
