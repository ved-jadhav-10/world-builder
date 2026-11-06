import { CalendarDays, Maximize, Minus, Plus, Settings, X } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Link } from 'react-router';
import { dayToDate, formatYear } from '@atlas/shared';
import { useTags } from '@/api/queries';
import { useTimeline } from '@/api/timeline-queries';
import { PlaybackBar } from '@/components/playback-bar';
import { UpcomingPanel } from '@/components/upcoming-panel';
import { TimelineChart, type TimelineItem, type TimelineLane } from '@/components/timeline-chart';
import { Button } from '@/components/ui/button';
import { NativeSelect } from '@/components/ui/inputs';
import { Badge, EmptyState, PageSpinner } from '@/components/ui/misc';
import { useDates } from '@/lib/use-dates';
import { cn } from '@/lib/utils';
import { useWorld } from '@/lib/world-context';

const SCENE_LANE = 'scenes';
const UNTAGGED_LANE = 'tag:none';
const SCENE_COLOR = '#64748b';

/** What the page shows for a selected item, and where it links (relative to the world). */
interface DetailInfo {
  title: string;
  lines: string[];
  path: string;
  linkLabel: string;
}

/** Everything with a date, as chart lanes and items; also the details shown for each. */
function useTimelineModel(groupBy: 'type' | 'tag') {
  const { world, types, typeById, base } = useWorld();
  const { data, isPending } = useTimeline(world.id);
  const { data: tagList } = useTags(world.id);
  const dates = useDates();

  return useMemo(() => {
    const items: TimelineItem[] = [];
    const details = new Map<string, DetailInfo>();
    // Tracks by tag: an entry with several tags runs in each of their tracks.
    const tracks = (entity: { typeId: string; tagIds: string[] }) =>
      groupBy === 'type'
        ? [{ lane: entity.typeId, suffix: '' }]
        : entity.tagIds.length > 0
          ? entity.tagIds.map((id) => ({ lane: `tag:${id}`, suffix: `@${id}` }))
          : [{ lane: UNTAGGED_LANE, suffix: '@none' }];

    for (const entity of data?.entities ?? []) {
      const type = typeById.get(entity.typeId);
      const from = entity.startDay ?? entity.endDay!;
      const to = entity.endDay ?? entity.startDay!;
      for (const track of tracks(entity)) {
        const key = `e:${entity.id}${track.suffix}`;
        items.push({
          key,
          laneKey: track.lane,
          name: entity.name,
          from,
          to,
          endOnly: entity.startDay === null,
          color: type?.color ?? '#64748b',
        });
        details.set(key, {
          title: entity.name,
          lines: [
            ...(entity.startDay !== null
              ? [`${type?.startLabel ?? 'Starts'}: ${dates.date(entity.startDay)}`]
              : []),
            ...(entity.endDay !== null
              ? [`${type?.endLabel ?? 'Ends'}: ${dates.date(entity.endDay)}`]
              : []),
          ],
          path: `/e/${entity.id}`,
          linkLabel: 'Open entry',
        });
      }
    }
    for (const scene of data?.scenes ?? []) {
      const key = `s:${scene.id}`;
      items.push({
        key,
        laneKey: SCENE_LANE,
        name: scene.title,
        from: scene.day,
        to: scene.day,
        endOnly: false,
        color: SCENE_COLOR,
      });
      details.set(key, {
        title: scene.title,
        lines: [
          [scene.bookTitle, scene.chapterTitle].filter(Boolean).join(' › '),
          dates.date(scene.day),
        ].filter(Boolean),
        path: `/manuscript/s/${scene.id}`,
        linkLabel: 'Open scene',
      });
    }

    const used = (key: string) => items.some((i) => i.laneKey === key);
    const entityLanes: TimelineLane[] =
      groupBy === 'type'
        ? types
            .filter((type) => used(type.id))
            .map((type) => ({ key: type.id, name: type.name, color: type.color }))
        : [
            ...(tagList ?? [])
              .filter((tag) => used(`tag:${tag.id}`))
              .map((tag) => ({ key: `tag:${tag.id}`, name: tag.name, color: tag.color })),
            ...(used(UNTAGGED_LANE)
              ? [{ key: UNTAGGED_LANE, name: 'No tag', color: SCENE_COLOR }]
              : []),
          ];
    const lanes: TimelineLane[] = [
      ...entityLanes,
      ...(used(SCENE_LANE) ? [{ key: SCENE_LANE, name: 'Manuscript', color: SCENE_COLOR }] : []),
    ];
    return { items, lanes, details, base, isPending };
  }, [data, types, typeById, tagList, groupBy, dates, base, isPending]);
}

/** The same dated things as a plain chronological list, grouped by year. */
function TimelineList({
  items,
  lanes,
  details,
  base,
  marker,
}: {
  items: TimelineItem[];
  lanes: TimelineLane[];
  details: Map<string, DetailInfo>;
  base: string;
  marker: number | null;
}) {
  const { calendar } = useWorld();
  const laneName = new Map(lanes.map((l) => [l.key, l.name]));
  const byYear = new Map<number, TimelineItem[]>();
  for (const item of [...items].sort((a, b) => a.from - b.from || a.name.localeCompare(b.name))) {
    const year = dayToDate(calendar, item.from).year;
    byYear.set(year, [...(byYear.get(year) ?? []), item]);
  }
  return (
    <div className="space-y-6">
      {[...byYear.entries()].map(([year, yearItems]) => (
        <section key={year}>
          <h3 className="sticky top-0 border-b bg-background py-1 font-serif text-lg font-semibold">
            {formatYear(calendar, year)}
          </h3>
          <ul className="divide-y">
            {yearItems.map((item) => {
              const detail = details.get(item.key)!;
              return (
                <li key={item.key} className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5 py-2">
                  <span
                    className="mt-1.5 size-2.5 shrink-0 self-start rounded-full"
                    style={{ backgroundColor: item.color }}
                  />
                  <Link
                    to={`${base}${detail.path}${marker !== null && item.key.startsWith('e:') ? `?asOf=d:${marker}` : ''}`}
                    className="font-medium hover:underline"
                  >
                    {item.name}
                  </Link>
                  <Badge>{laneName.get(item.laneKey)}</Badge>
                  <span className="text-sm text-muted-foreground">{detail.lines.join(' · ')}</span>
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </div>
  );
}

/** What is going on at the marker: everything whose dates take in that day. */
function OnThisDate({
  day,
  items,
  details,
  withMarker,
}: {
  day: number;
  items: TimelineItem[];
  details: Map<string, DetailInfo>;
  withMarker: (path: string) => string;
}) {
  const dates = useDates();
  const shown = items.slice(0, 12);
  return (
    <section aria-label="On this date" className="rounded-xl border bg-card p-4">
      <h2 className="text-sm font-semibold">
        On {dates.date(day)}
        <span className="ml-2 font-normal text-muted-foreground">
          {items.length === 0 ? 'nothing is dated here' : `${items.length} going on`}
        </span>
      </h2>
      {shown.length > 0 ? (
        <ul className="mt-2 flex flex-wrap gap-2">
          {shown.map((item) => (
            <li key={item.key}>
              <Link
                to={withMarker(details.get(item.key)?.path ?? '')}
                className="inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[13px] hover:bg-muted"
              >
                <span className="size-2 rounded-full" style={{ backgroundColor: item.color }} />
                {item.name}
              </Link>
            </li>
          ))}
          {items.length > shown.length ? (
            <li className="px-1 py-1 text-[13px] text-muted-foreground">
              and {items.length - shown.length} more
            </li>
          ) : null}
        </ul>
      ) : null}
    </section>
  );
}

export function TimelinePage() {
  const { world, base, canEdit } = useWorld();
  const dates = useDates();
  const [groupBy, setGroupBy] = useState<'type' | 'tag'>('type');
  const model = useTimelineModel(groupBy);
  const [view, setView] = useState<'chart' | 'list'>('chart');
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const [selected, setSelected] = useState<string | null>(null);
  const [marker, setMarker] = useState<number | null>(null);
  const [fitRequest, setFitRequest] = useState(0);
  const [zoom, setZoom] = useState({ factor: 1, n: 0 });

  if (model.isPending) return <PageSpinner />;

  const lanes = model.lanes.filter((l) => !hidden.has(l.key));
  const items = model.items.filter((i) => !hidden.has(i.laneKey));
  const detail = selected ? model.details.get(selected) : undefined;
  // A marker turns links to entries into "as of" views at that date.
  const withMarker = (path: string) =>
    `${base}${path}${marker !== null && path.startsWith('/e/') ? `?asOf=d:${marker}` : ''}`;

  if (model.items.length === 0) {
    return (
      <EmptyState icon={<CalendarDays />} title="Nothing is dated yet">
        <p>
          Give entries dates (born and died, founded, begins and ends) or give scenes an in-world
          date, and they appear here in order. Dates use your world’s calendar.
        </p>
        {canEdit ? (
          <Button asChild variant="outline" className="mt-4">
            <Link to={`${base}/settings/calendar`}>
              <Settings /> Set up the calendar
            </Link>
          </Button>
        ) : null}
      </EmptyState>
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-sm font-medium text-muted-foreground">Timeline</p>
          <h1 className="font-serif text-3xl font-semibold">{world.name}</h1>
          <p className="mt-1 text-muted-foreground">
            {model.items.length} dated {model.items.length === 1 ? 'item' : 'items'}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div
            role="radiogroup"
            aria-label="View"
            className="inline-flex rounded-md border bg-card p-0.5"
          >
            {(['chart', 'list'] as const).map((mode) => (
              <button
                key={mode}
                type="button"
                role="radio"
                aria-checked={view === mode}
                onClick={() => setView(mode)}
                className={cn(
                  'rounded px-3 py-1 text-[13px] capitalize transition-colors',
                  view === mode
                    ? 'bg-accent font-medium text-accent-foreground'
                    : 'text-muted-foreground hover:text-foreground',
                )}
              >
                {mode}
              </button>
            ))}
          </div>
          <NativeSelect
            aria-label="Group the timeline by"
            className="h-8 w-auto text-[13px]"
            value={groupBy}
            onChange={(event) => {
              setGroupBy(event.target.value === 'tag' ? 'tag' : 'type');
              setHidden(new Set());
              setSelected(null);
            }}
          >
            <option value="type">Tracks by type</option>
            <option value="tag">Tracks by tag</option>
          </NativeSelect>
          {view === 'chart' ? (
            <div className="inline-flex items-center gap-0.5">
              <Button
                variant="outline"
                size="icon-sm"
                onClick={() => setZoom((z) => ({ factor: 1 / 1.6, n: z.n + 1 }))}
              >
                <Minus />
                <span className="sr-only">Zoom out</span>
              </Button>
              <Button
                variant="outline"
                size="icon-sm"
                onClick={() => setZoom((z) => ({ factor: 1.6, n: z.n + 1 }))}
              >
                <Plus />
                <span className="sr-only">Zoom in</span>
              </Button>
              <Button variant="outline" size="sm" onClick={() => setFitRequest((n) => n + 1)}>
                <Maximize /> Fit
              </Button>
            </div>
          ) : null}
          {canEdit ? (
            <Button asChild variant="ghost" size="sm">
              <Link to={`${base}/settings/calendar`}>
                <Settings /> Calendar
              </Link>
            </Button>
          ) : null}
        </div>
      </div>

      <UpcomingPanel />

      <PlaybackBar
        from={Math.min(...model.items.map((i) => i.from))}
        to={Math.max(...model.items.map((i) => i.to))}
        value={marker}
        onChange={setMarker}
        onClose={marker === null ? undefined : () => setMarker(null)}
      />
      {marker !== null ? (
        <OnThisDate
          day={marker}
          items={items.filter((i) => i.from <= marker && marker <= i.to)}
          details={model.details}
          withMarker={withMarker}
        />
      ) : null}

      <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Show">
        {model.lanes.map((lane) => {
          const on = !hidden.has(lane.key);
          const count = model.items.filter((i) => i.laneKey === lane.key).length;
          return (
            <button
              key={lane.key}
              type="button"
              aria-pressed={on}
              onClick={() =>
                setHidden((current) => {
                  const next = new Set(current);
                  if (next.has(lane.key)) next.delete(lane.key);
                  else next.add(lane.key);
                  return next;
                })
              }
              className={cn(
                'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[13px] transition-colors',
                on ? 'bg-card' : 'text-muted-foreground opacity-60',
              )}
            >
              <span className="size-2.5 rounded-full" style={{ backgroundColor: lane.color }} />
              {lane.name}
              <span className="text-xs tabular-nums text-muted-foreground">{count}</span>
            </button>
          );
        })}
        {marker !== null ? (
          <span className="ml-auto inline-flex items-center gap-1.5 rounded-full border border-primary/40 bg-accent py-1 pl-3 pr-1.5 text-[13px] text-accent-foreground">
            Marker: {dates.date(marker)}
            <button
              type="button"
              aria-label="Clear marker"
              className="rounded-full p-0.5 hover:bg-background/50"
              onClick={() => setMarker(null)}
            >
              <X className="size-3.5" />
            </button>
          </span>
        ) : null}
      </div>

      {items.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Everything is hidden. Turn a group back on above.
        </p>
      ) : view === 'chart' ? (
        <>
          <TimelineChart
            items={items}
            lanes={lanes}
            selectedKey={selected}
            onSelect={setSelected}
            marker={marker}
            onMarker={setMarker}
            fitRequest={fitRequest}
            zoomRequest={zoom}
          />
          <p className="text-xs text-muted-foreground">
            Drag to pan. Ctrl + scroll, or the buttons, to zoom. Click the date ruler to drop a
            marker; entries you open from here then show as they were on that date.
          </p>
          {detail ? (
            <section aria-label="Selected item" className="rounded-xl border bg-card p-4">
              <div className="flex items-start gap-3">
                <div className="min-w-0 flex-1">
                  <h2 className="font-serif text-xl font-semibold">{detail.title}</h2>
                  {detail.lines.map((line) => (
                    <p key={line} className="text-sm text-muted-foreground">
                      {line}
                    </p>
                  ))}
                </div>
                <Button asChild size="sm">
                  <Link to={withMarker(detail.path)}>{detail.linkLabel}</Link>
                </Button>
                <Button variant="ghost" size="icon-sm" onClick={() => setSelected(null)}>
                  <X />
                  <span className="sr-only">Close</span>
                </Button>
              </div>
            </section>
          ) : null}
        </>
      ) : (
        <TimelineList
          items={items}
          lanes={lanes}
          details={model.details}
          base={base}
          marker={marker}
        />
      )}
    </div>
  );
}

export { TimelinePage as Component };
