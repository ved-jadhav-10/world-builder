import { BellRing } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Link } from 'react-router';
import { upcomingReminders, type DatedMoment } from '@atlas/shared';
import { useCalendar, useTimeline } from '@/api/timeline-queries';
import { NativeSelect } from '@/components/ui/inputs';
import { useDates } from '@/lib/use-dates';
import { useWorld } from '@/lib/world-context';

const WINDOWS = [7, 30, 90, 365] as const;

/** What is coming up around the world's "today": dates ahead, and the yearly return of past ones. */
export function UpcomingPanel() {
  const { world, base, typeById, canEdit } = useWorld();
  const dates = useDates();
  const { data: calendar } = useCalendar(world.id);
  const { data: timeline } = useTimeline(world.id);
  const [within, setWithin] = useState<number>(30);
  const today = calendar?.today ?? null;

  const reminders = useMemo(() => {
    if (today === null || !timeline) return [];
    const moments: DatedMoment[] = timeline.entities.flatMap((entity) => {
      const type = typeById.get(entity.typeId);
      const who = { id: entity.id, name: entity.name, typeId: entity.typeId };
      return [
        ...(entity.startDay !== null
          ? [{ ...who, day: entity.startDay, label: type?.startLabel ?? 'Starts' }]
          : []),
        ...(entity.endDay !== null
          ? [{ ...who, day: entity.endDay, label: type?.endLabel ?? 'Ends' }]
          : []),
      ];
    });
    return upcomingReminders(dates.calendar, moments, today, within);
  }, [today, timeline, typeById, dates.calendar, within]);

  if (today === null) {
    return canEdit ? (
      <p className="text-sm text-muted-foreground">
        <BellRing className="mr-1.5 inline size-4 align-text-bottom" />
        Set today’s date in your world to see what is coming up.{' '}
        <Link to={`${base}/settings/calendar`} className="underline">
          Set it in the calendar settings
        </Link>
        .
      </p>
    ) : null;
  }

  return (
    <section aria-label="Coming up" className="space-y-2 rounded-xl border bg-card p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 text-sm font-semibold">
          <BellRing className="size-4 text-muted-foreground" /> Coming up
          <span className="font-normal text-muted-foreground">from {dates.date(today)}</span>
        </h2>
        <NativeSelect
          aria-label="How far ahead"
          className="h-8 w-auto text-[13px]"
          value={within}
          onChange={(event) => setWithin(Number(event.target.value))}
        >
          {WINDOWS.map((days) => (
            <option key={days} value={days}>
              Next {days} days
            </option>
          ))}
        </NativeSelect>
      </div>
      {reminders.length === 0 ? (
        <p className="text-sm text-muted-foreground">Nothing is dated in this stretch.</p>
      ) : (
        <ul className="divide-y text-sm">
          {reminders.map((r) => (
            <li
              key={`${r.id}:${r.label}`}
              className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5 py-1.5"
            >
              <span className="w-24 shrink-0 tabular-nums text-muted-foreground">
                {r.inDays === 0 ? 'Today' : r.inDays === 1 ? 'Tomorrow' : `In ${r.inDays} days`}
              </span>
              <Link to={`${base}/e/${r.id}`} className="font-medium hover:underline">
                {r.name}
              </Link>
              <span className="text-muted-foreground">
                {r.anniversary
                  ? `${r.years} ${r.years === 1 ? 'year' : 'years'} since: ${r.label.toLowerCase()}`
                  : r.label.toLowerCase()}
                {' · '}
                {dates.date(r.day)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
