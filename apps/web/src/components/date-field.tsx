import { X } from 'lucide-react';
import { useState } from 'react';
import {
  dateToDay,
  dayToDate,
  daysInMonth,
  eraLabel,
  eraOf,
  eraYearToAbsolute,
  formatDate,
  moonPhase,
  weekdayOf,
  type CalendarDef,
} from '@atlas/shared';
import { Button } from '@/components/ui/button';
import { Input, NativeSelect } from '@/components/ui/inputs';
import { useWorld } from '@/lib/world-context';

interface Draft {
  /** Index into the calendar's eras, or -1 for a plain year. */
  era: number;
  year: string;
  /** Index into the months, or -1 when none is picked. */
  month: number;
  day: string;
}

/** New dates start in the most recent era, which is usually the one the story is set in. */
const emptyDraft = (calendar: CalendarDef): Draft => ({
  era: calendar.eras.length - 1,
  year: '',
  month: -1,
  day: '',
});

function draftFromDay(calendar: CalendarDef, value: number | null): Draft {
  if (value === null) return emptyDraft(calendar);
  const date = dayToDate(calendar, value);
  const era = eraOf(calendar, date.year);
  return {
    era: era ? era.index : -1,
    year: String(era ? era.yearInEra : date.year),
    month: date.month,
    day: String(date.day),
  };
}

/** The day number a complete draft stands for, or null while it is still being filled in. */
function dayFromDraft(calendar: CalendarDef, draft: Draft): number | null {
  const year = Number(draft.year);
  const day = Number(draft.day);
  if (draft.year.trim() === '' || draft.day.trim() === '' || draft.month < 0) return null;
  if (!Number.isInteger(year) || !Number.isInteger(day) || day < 1) return null;
  const era = calendar.eras[draft.era];
  const absoluteYear = era ? eraYearToAbsolute(era, year) : year;
  if (Math.abs(absoluteYear) > 100_000) return null;
  // A day past the end of the month lands on its last day, rather than being refused.
  const lastDay = daysInMonth(calendar, absoluteYear, draft.month);
  return dateToDay(calendar, {
    year: absoluteYear,
    month: draft.month,
    day: Math.min(day, lastDay),
  });
}

/**
 * Picks an in-world date for the world's calendar: day, month, year and (if the calendar has
 * eras) era. The value is a day number, or null for "no date".
 */
export function DateField({
  value,
  onChange,
  disabled,
  label,
}: {
  value: number | null;
  onChange: (day: number | null) => void;
  disabled?: boolean;
  /** Names the group for screen readers, such as "Born". */
  label: string;
}) {
  const { calendar } = useWorld();
  const [draft, setDraft] = useState(() => draftFromDay(calendar, value));
  // Follow the value when it changes from outside (a reset, or a different entry).
  const [shownValue, setShownValue] = useState(value);
  if (value !== shownValue) {
    setShownValue(value);
    if (value !== dayFromDraft(calendar, draft)) setDraft(draftFromDay(calendar, value));
  }

  function update(patch: Partial<Draft>) {
    const next = { ...draft, ...patch };
    setDraft(next);
    const day = dayFromDraft(calendar, next);
    if (day !== null && day !== value) {
      setShownValue(day);
      onChange(day);
    }
  }

  function clear() {
    setDraft(emptyDraft(calendar));
    setShownValue(null);
    onChange(null);
  }

  const moons =
    value === null
      ? []
      : calendar.moons.map((moon) => `${moon.name}: ${moonPhase(moon, value).name.toLowerCase()}`);
  const weekday = value === null ? null : calendar.weekdays[weekdayOf(calendar, value)];

  return (
    <div role="group" aria-label={label} className="space-y-1.5">
      <div className="flex flex-wrap items-center gap-1.5">
        <Input
          type="number"
          min={1}
          inputMode="numeric"
          aria-label={`${label}: day`}
          placeholder="Day"
          className="w-16"
          disabled={disabled}
          value={draft.day}
          onChange={(event) => update({ day: event.target.value })}
        />
        <NativeSelect
          aria-label={`${label}: month`}
          className="w-36"
          disabled={disabled}
          value={draft.month}
          onChange={(event) => update({ month: Number(event.target.value) })}
        >
          <option value={-1}>Month</option>
          {calendar.months.map((month, index) => (
            <option key={index} value={index}>
              {month.name}
            </option>
          ))}
        </NativeSelect>
        <Input
          type="number"
          inputMode="numeric"
          aria-label={`${label}: year`}
          placeholder="Year"
          className="w-24"
          disabled={disabled}
          value={draft.year}
          onChange={(event) => update({ year: event.target.value })}
        />
        {calendar.eras.length > 0 ? (
          <NativeSelect
            aria-label={`${label}: era`}
            className="w-24"
            disabled={disabled}
            value={draft.era}
            onChange={(event) => update({ era: Number(event.target.value) })}
          >
            {calendar.eras.map((era, index) => (
              <option key={index} value={index} title={era.name}>
                {eraLabel(era)}
              </option>
            ))}
            <option value={-1}>(no era)</option>
          </NativeSelect>
        ) : null}
        {value !== null && !disabled ? (
          <Button type="button" variant="ghost" size="icon-sm" onClick={clear}>
            <X />
            <span className="sr-only">Clear {label}</span>
          </Button>
        ) : null}
      </div>
      {value !== null ? (
        <p className="text-xs text-muted-foreground" data-testid="date-summary">
          {weekday ? `${weekday}, ` : ''}
          {formatDate(calendar, value)}
          {moons.length ? ` · ${moons.join(' · ')}` : ''}
        </p>
      ) : null}
    </div>
  );
}
