import { ArrowDown, ArrowUp, Plus, Trash2 } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { Link } from 'react-router';
import { toast } from 'sonner';
import {
  CALENDAR_PRESETS,
  calendarUpdateSchema,
  dateToDay,
  eraLabel,
  formatDate,
  yearLength,
  type CalendarDef,
} from '@atlas/shared';
import { errorMessage } from '@/api/client';
import { useCalendar, useSaveCalendar } from '@/api/timeline-queries';
import { Button } from '@/components/ui/button';
import { Input, Label, NativeSelect } from '@/components/ui/inputs';
import { PageSpinner } from '@/components/ui/misc';
import { useWorld } from '@/lib/world-context';

/** The calendar as the form edits it: numbers stay numbers, and nothing is dropped until saving. */
type Draft = CalendarDef;

const num = (value: string, fallback = 0) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

function Section({
  title,
  hint,
  children,
  action,
}: {
  title: string;
  hint?: string;
  children: ReactNode;
  action?: ReactNode;
}) {
  return (
    <section className="space-y-3 rounded-xl border bg-card p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="font-serif text-lg font-semibold">{title}</h2>
          {hint ? <p className="text-sm text-muted-foreground">{hint}</p> : null}
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}

function RemoveButton({ onClick, label }: { onClick: () => void; label: string }) {
  return (
    <Button type="button" variant="ghost" size="icon-sm" onClick={onClick}>
      <Trash2 />
      <span className="sr-only">{label}</span>
    </Button>
  );
}

function move<T>(list: T[], index: number, by: -1 | 1): T[] {
  const target = index + by;
  if (target < 0 || target >= list.length) return list;
  const next = [...list];
  [next[index], next[target]] = [next[target]!, next[index]!];
  return next;
}

/** A few sample dates, so you can see what the rules above add up to. */
function Preview({ calendar }: { calendar: CalendarDef }) {
  const samples = [0, 1, 100, 1000].flatMap((year) => {
    try {
      const first = dateToDay(calendar, { year, month: 0, day: 1 });
      return [{ year, first, length: yearLength(calendar, year) }];
    } catch {
      return [];
    }
  });
  const last = calendar.months.length - 1;
  const lastLength = calendar.months[last]?.days ?? 1;
  const lastDate = (() => {
    try {
      return formatDate(calendar, dateToDay(calendar, { year: 0, month: last, day: lastLength }), {
        weekday: true,
      });
    } catch {
      return '';
    }
  })();
  const week = calendar.weekdays.length;
  const yearDays = calendar.months.reduce((sum, m) => sum + m.days, 0);
  return (
    <div className="space-y-1 text-sm text-muted-foreground">
      <p>
        A normal year has <strong className="text-foreground">{yearDays}</strong> days in{' '}
        {calendar.months.length} {calendar.months.length === 1 ? 'month' : 'months'}, and a week has{' '}
        {week} {week === 1 ? 'day' : 'days'}.
      </p>
      {samples.map(({ year, first, length }) => (
        <p key={year}>
          Year {year} starts on{' '}
          <span className="text-foreground">{formatDate(calendar, first, { weekday: true })}</span>{' '}
          and has {length} days.
        </p>
      ))}
      {lastDate ? (
        <p>
          Year 0 ends on <span className="text-foreground">{lastDate}</span>.
        </p>
      ) : null}
    </div>
  );
}

function CalendarEditor({ initialName, initial }: { initialName: string; initial: CalendarDef }) {
  const { world, base } = useWorld();
  const save = useSaveCalendar(world.id);
  const [name, setName] = useState(initialName);
  const [draft, setDraft] = useState<Draft>(initial);
  const [dirty, setDirty] = useState(false);

  const change = (next: Draft) => {
    setDraft(next);
    setDirty(true);
  };
  const parsed = calendarUpdateSchema.safeParse({ name, definition: draft });
  const problem = parsed.success
    ? null
    : (() => {
        const issue = parsed.error.issues[0]!;
        const path = issue.path.filter((p) => p !== 'definition').join(' › ');
        return path ? `${path}: ${issue.message}` : issue.message;
      })();

  async function onSave() {
    if (!parsed.success) return;
    try {
      await save.mutateAsync(parsed.data);
      setDirty(false);
      toast.success('Calendar saved');
    } catch (error) {
      toast.error(errorMessage(error));
    }
  }

  const monthOptions = draft.months.map((m, i) => (
    <option key={i} value={i}>
      {m.name || `Month ${i + 1}`}
    </option>
  ));

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <Link
          to={`${base}/timeline`}
          className="text-sm text-muted-foreground hover:text-foreground"
        >
          ← Timeline
        </Link>
        <h1 className="mt-1 font-serif text-3xl font-semibold">Calendar</h1>
        <p className="mt-1 text-muted-foreground">
          How time works in {world.name}. Every date in your world is stored as a day count, so
          changing month lengths or leap rules moves where existing dates fall in the calendar, but
          never puts them out of order.
        </p>
      </div>

      <Section
        title="Start from"
        hint="Replaces everything below. You can still change it afterwards."
      >
        <div className="flex flex-wrap gap-2">
          {CALENDAR_PRESETS.map((preset) => (
            <Button
              key={preset.key}
              variant="outline"
              size="sm"
              onClick={() => {
                change(structuredClone(preset.calendar));
                setName(preset.name);
              }}
            >
              {preset.name}
            </Button>
          ))}
        </div>
      </Section>

      <Section title="Name">
        <Input
          aria-label="Calendar name"
          value={name}
          maxLength={80}
          onChange={(event) => {
            setName(event.target.value);
            setDirty(true);
          }}
        />
      </Section>

      <Section
        title="Months"
        action={
          <Button
            size="sm"
            variant="outline"
            onClick={() =>
              change({
                ...draft,
                months: [...draft.months, { name: `Month ${draft.months.length + 1}`, days: 30 }],
              })
            }
          >
            <Plus /> Add month
          </Button>
        }
      >
        <ul className="space-y-2">
          {draft.months.map((month, index) => (
            <li key={index} className="flex items-center gap-2">
              <span className="w-6 text-right text-xs tabular-nums text-muted-foreground">
                {index + 1}
              </span>
              <Input
                aria-label={`Month ${index + 1} name`}
                value={month.name}
                maxLength={40}
                onChange={(event) =>
                  change({
                    ...draft,
                    months: draft.months.map((m, i) =>
                      i === index ? { ...m, name: event.target.value } : m,
                    ),
                  })
                }
              />
              <Input
                type="number"
                min={1}
                aria-label={`Month ${index + 1} days`}
                className="w-20"
                value={month.days}
                onChange={(event) =>
                  change({
                    ...draft,
                    months: draft.months.map((m, i) =>
                      i === index ? { ...m, days: num(event.target.value) } : m,
                    ),
                  })
                }
              />
              <span className="text-sm text-muted-foreground">days</span>
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                disabled={index === 0}
                onClick={() => change({ ...draft, months: move(draft.months, index, -1) })}
              >
                <ArrowUp />
                <span className="sr-only">Move month up</span>
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                disabled={index === draft.months.length - 1}
                onClick={() => change({ ...draft, months: move(draft.months, index, 1) })}
              >
                <ArrowDown />
                <span className="sr-only">Move month down</span>
              </Button>
              <RemoveButton
                label={`Remove month ${index + 1}`}
                onClick={() =>
                  change({
                    ...draft,
                    months: draft.months.filter((_, i) => i !== index),
                    // Leap rules that pointed past the end would no longer make sense.
                    leapRules: draft.leapRules
                      .filter((rule) => rule.monthIndex !== index)
                      .map((rule) => ({
                        ...rule,
                        monthIndex: rule.monthIndex > index ? rule.monthIndex - 1 : rule.monthIndex,
                      })),
                  })
                }
              />
            </li>
          ))}
        </ul>
      </Section>

      <Section
        title="Week"
        action={
          <Button
            size="sm"
            variant="outline"
            onClick={() =>
              change({
                ...draft,
                weekdays: [...draft.weekdays, `Day ${draft.weekdays.length + 1}`],
              })
            }
          >
            <Plus /> Add weekday
          </Button>
        }
      >
        <ul className="space-y-2">
          {draft.weekdays.map((weekday, index) => (
            <li key={index} className="flex items-center gap-2">
              <Input
                aria-label={`Weekday ${index + 1}`}
                value={weekday}
                maxLength={40}
                onChange={(event) =>
                  change({
                    ...draft,
                    weekdays: draft.weekdays.map((w, i) => (i === index ? event.target.value : w)),
                  })
                }
              />
              <RemoveButton
                label={`Remove weekday ${index + 1}`}
                onClick={() =>
                  change({
                    ...draft,
                    weekdays: draft.weekdays.filter((_, i) => i !== index),
                    weekdayOffset: Math.min(
                      draft.weekdayOffset,
                      Math.max(0, draft.weekdays.length - 2),
                    ),
                  })
                }
              />
            </li>
          ))}
        </ul>
        <div className="space-y-1.5">
          <Label htmlFor="weekday-offset">Day 0 (the first day of year 0) is a</Label>
          <NativeSelect
            id="weekday-offset"
            className="max-w-48"
            value={draft.weekdayOffset}
            onChange={(event) => change({ ...draft, weekdayOffset: Number(event.target.value) })}
          >
            {draft.weekdays.map((w, i) => (
              <option key={i} value={i}>
                {w || `Weekday ${i + 1}`}
              </option>
            ))}
          </NativeSelect>
        </div>
      </Section>

      <Section
        title="Leap years"
        hint="Add extra days to a month in some years. Earth: February, every 4 years, except every 100, unless also every 400."
        action={
          <Button
            size="sm"
            variant="outline"
            onClick={() =>
              change({
                ...draft,
                leapRules: [
                  ...draft.leapRules,
                  {
                    monthIndex: 0,
                    extraDays: 1,
                    every: 4,
                    offset: 0,
                    skipEvery: null,
                    restoreEvery: null,
                  },
                ],
              })
            }
          >
            <Plus /> Add rule
          </Button>
        }
      >
        {draft.leapRules.length === 0 ? (
          <p className="text-sm text-muted-foreground">Every year is the same length.</p>
        ) : null}
        <ul className="space-y-3">
          {draft.leapRules.map((rule, index) => {
            const update = (patch: Partial<typeof rule>) =>
              change({
                ...draft,
                leapRules: draft.leapRules.map((r, i) => (i === index ? { ...r, ...patch } : r)),
              });
            return (
              <li key={index} className="space-y-2 rounded-lg border p-3 text-sm">
                <div className="flex flex-wrap items-center gap-2">
                  Add
                  <Input
                    type="number"
                    min={1}
                    aria-label={`Rule ${index + 1} extra days`}
                    className="w-16"
                    value={rule.extraDays}
                    onChange={(event) => update({ extraDays: num(event.target.value) })}
                  />
                  {rule.extraDays === 1 ? 'day' : 'days'} to
                  <NativeSelect
                    aria-label={`Rule ${index + 1} month`}
                    className="w-40"
                    value={rule.monthIndex}
                    onChange={(event) => update({ monthIndex: Number(event.target.value) })}
                  >
                    {monthOptions}
                  </NativeSelect>
                  every
                  <Input
                    type="number"
                    min={2}
                    aria-label={`Rule ${index + 1} every`}
                    className="w-20"
                    value={rule.every}
                    onChange={(event) => update({ every: num(event.target.value) })}
                  />
                  years
                  <RemoveButton
                    label={`Remove rule ${index + 1}`}
                    onClick={() =>
                      change({ ...draft, leapRules: draft.leapRules.filter((_, i) => i !== index) })
                    }
                  />
                </div>
                <div className="flex flex-wrap items-center gap-2 text-muted-foreground">
                  counting from year
                  <Input
                    type="number"
                    min={0}
                    aria-label={`Rule ${index + 1} offset`}
                    className="w-20"
                    value={rule.offset}
                    onChange={(event) => update({ offset: num(event.target.value) })}
                  />
                  (0 = years divisible by the interval). Except every
                  <Input
                    type="number"
                    min={2}
                    placeholder="never"
                    aria-label={`Rule ${index + 1} except every`}
                    className="w-20"
                    value={rule.skipEvery ?? ''}
                    onChange={(event) =>
                      update({
                        skipEvery: event.target.value === '' ? null : num(event.target.value),
                      })
                    }
                  />
                  years, unless also every
                  <Input
                    type="number"
                    min={2}
                    placeholder="never"
                    aria-label={`Rule ${index + 1} unless every`}
                    className="w-20"
                    value={rule.restoreEvery ?? ''}
                    onChange={(event) =>
                      update({
                        restoreEvery: event.target.value === '' ? null : num(event.target.value),
                      })
                    }
                  />
                  years.
                </div>
              </li>
            );
          })}
        </ul>
      </Section>

      <Section
        title="Eras"
        hint="Name stretches of history. Year 1 of an era is the year you set; earlier years show as plain numbers."
        action={
          <Button
            size="sm"
            variant="outline"
            onClick={() =>
              change({
                ...draft,
                eras: [
                  ...draft.eras,
                  {
                    name: `Age ${draft.eras.length + 1}`,
                    abbreviation: '',
                    startYear: draft.eras.length
                      ? Math.max(...draft.eras.map((e) => e.startYear)) + 1000
                      : 1,
                  },
                ],
              })
            }
          >
            <Plus /> Add era
          </Button>
        }
      >
        {draft.eras.length === 0 ? (
          <p className="text-sm text-muted-foreground">Years are shown as plain numbers.</p>
        ) : null}
        <ul className="space-y-2">
          {draft.eras.map((era, index) => {
            const update = (patch: Partial<typeof era>) =>
              change({
                ...draft,
                eras: draft.eras.map((e, i) => (i === index ? { ...e, ...patch } : e)),
              });
            return (
              <li key={index} className="flex flex-wrap items-center gap-2">
                <Input
                  aria-label={`Era ${index + 1} name`}
                  className="min-w-40 flex-1"
                  value={era.name}
                  maxLength={60}
                  onChange={(event) => update({ name: event.target.value })}
                />
                <Input
                  aria-label={`Era ${index + 1} abbreviation`}
                  placeholder="Short"
                  className="w-20"
                  value={era.abbreviation}
                  maxLength={10}
                  onChange={(event) => update({ abbreviation: event.target.value })}
                />
                <span className="text-sm text-muted-foreground">year 1 is year</span>
                <Input
                  type="number"
                  aria-label={`Era ${index + 1} first year`}
                  className="w-28"
                  value={era.startYear}
                  onChange={(event) => update({ startYear: num(event.target.value) })}
                />
                <RemoveButton
                  label={`Remove era ${index + 1}`}
                  onClick={() =>
                    change({ ...draft, eras: draft.eras.filter((_, i) => i !== index) })
                  }
                />
              </li>
            );
          })}
        </ul>
        {draft.eras.length > 0 ? (
          <p className="text-xs text-muted-foreground">
            Shown as:{' '}
            {[...draft.eras]
              .sort((a, b) => a.startYear - b.startYear)
              .map((era) => `1 ${eraLabel(era)} = year ${era.startYear}`)
              .join(', ')}
          </p>
        ) : null}
      </Section>

      <Section
        title="Moons"
        hint="Shown with each date. A moon is new on its first day and full halfway through its cycle."
        action={
          <Button
            size="sm"
            variant="outline"
            onClick={() =>
              change({
                ...draft,
                moons: [
                  ...draft.moons,
                  { name: `Moon ${draft.moons.length + 1}`, cycleDays: 28, offsetDays: 0 },
                ],
              })
            }
          >
            <Plus /> Add moon
          </Button>
        }
      >
        {draft.moons.length === 0 ? (
          <p className="text-sm text-muted-foreground">No moons.</p>
        ) : null}
        <ul className="space-y-2">
          {draft.moons.map((moon, index) => {
            const update = (patch: Partial<typeof moon>) =>
              change({
                ...draft,
                moons: draft.moons.map((m, i) => (i === index ? { ...m, ...patch } : m)),
              });
            return (
              <li key={index} className="flex flex-wrap items-center gap-2">
                <Input
                  aria-label={`Moon ${index + 1} name`}
                  className="min-w-32 flex-1"
                  value={moon.name}
                  maxLength={40}
                  onChange={(event) => update({ name: event.target.value })}
                />
                <span className="text-sm text-muted-foreground">cycle of</span>
                <Input
                  type="number"
                  step="any"
                  aria-label={`Moon ${index + 1} cycle days`}
                  className="w-24"
                  value={moon.cycleDays}
                  onChange={(event) => update({ cycleDays: num(event.target.value) })}
                />
                <span className="text-sm text-muted-foreground">days; new on day</span>
                <Input
                  type="number"
                  step="any"
                  aria-label={`Moon ${index + 1} first new moon`}
                  className="w-24"
                  value={moon.offsetDays}
                  onChange={(event) => update({ offsetDays: num(event.target.value) })}
                />
                <RemoveButton
                  label={`Remove moon ${index + 1}`}
                  onClick={() =>
                    change({ ...draft, moons: draft.moons.filter((_, i) => i !== index) })
                  }
                />
              </li>
            );
          })}
        </ul>
      </Section>

      <Section title="Preview">
        {parsed.success ? (
          <Preview calendar={parsed.data.definition} />
        ) : (
          <p className="text-sm text-muted-foreground">Fix the problem below to see a preview.</p>
        )}
      </Section>

      <div className="sticky bottom-0 -mx-1 flex flex-wrap items-center gap-3 border-t bg-background/95 px-1 py-3 backdrop-blur">
        <Button onClick={onSave} disabled={!parsed.success || !dirty || save.isPending}>
          Save calendar
        </Button>
        {problem ? (
          <p role="alert" className="text-sm text-destructive">
            {problem}
          </p>
        ) : dirty ? (
          <p className="text-sm text-muted-foreground">Unsaved changes</p>
        ) : null}
      </div>
    </div>
  );
}

export function CalendarSettingsPage() {
  const { world } = useWorld();
  const { data, isPending } = useCalendar(world.id);
  if (isPending || !data) return <PageSpinner />;
  // Keyed on the saved version, so a save (or a preset) starts the form fresh from the server.
  return (
    <CalendarEditor
      key={data.updatedAt ?? 'default'}
      initialName={data.name}
      initial={structuredClone(data.definition)}
    />
  );
}

export { CalendarSettingsPage as Component };
