import {
  ArrowDown,
  ArrowUp,
  Dices,
  LayoutDashboard,
  NotebookPen,
  Pin,
  Plus,
  StickyNote,
  Table2,
  Timer,
  X,
} from 'lucide-react';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Link } from 'react-router';
import { toast } from 'sonner';
import {
  CLOCK_SEGMENT_CHOICES,
  GM_WIDGET_LABELS,
  GM_WIDGET_TYPES,
  MAX_GM_WIDGETS,
  MAX_PINNED_ENTRIES,
  MAX_SCRATCHPAD,
  type EntitySummary,
  type GmScreen,
  type GmWidget,
  type GmWidgetType,
  type RollLogEntry,
} from '@atlas/shared';
import { errorMessage } from '@/api/client';
import { useGmScreen, useSaveGmScreen } from '@/api/gm-screen-queries';
import { useSessions } from '@/api/gm-queries';
import { useRollTable, useTables } from '@/api/table-queries';
import { EntityIcon } from '@/components/entity-icon';
import { EntityPicker, type PickedEntity } from '@/components/entity-picker';
import { RollPanel, RollResult } from '@/components/roll-panel';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Input, NativeSelect, Textarea } from '@/components/ui/inputs';
import { EmptyState, PageSpinner, Spinner } from '@/components/ui/misc';
import { useDebounced } from '@/lib/use-debounced';
import { cn } from '@/lib/utils';
import { useWorld } from '@/lib/world-context';

const WIDGET_ICONS: Record<GmWidgetType, ReactNode> = {
  dice: <Dices />,
  table: <Table2 />,
  entries: <Pin />,
  notes: <StickyNote />,
  clock: <Timer />,
  session: <NotebookPen />,
};

const newId = () => crypto.randomUUID().slice(0, 8);

function blankWidget(type: GmWidgetType): GmWidget {
  const base = { id: newId(), title: '' };
  switch (type) {
    case 'dice':
      return { ...base, type };
    case 'table':
      return { ...base, type, tableId: null };
    case 'entries':
      return { ...base, type, entityIds: [] };
    case 'notes':
      return { ...base, type, text: '' };
    case 'clock':
      return { ...base, type, segments: 6, filled: 0 };
    case 'session':
      return { ...base, type };
  }
}

// ---- The widgets ------------------------------------------------------------------------------

function TableWidget({
  widget,
  onChange,
}: {
  widget: Extract<GmWidget, { type: 'table' }>;
  onChange: (patch: Partial<typeof widget>) => void;
}) {
  const { world, base } = useWorld();
  const { data: tables, isPending } = useTables(world.id);
  const roll = useRollTable(world.id);
  const [last, setLast] = useState<RollLogEntry | null>(null);
  const [share, setShare] = useState(false);
  const chosen = tables?.find((table) => table.id === widget.tableId);

  if (isPending) return <Spinner />;
  if (!tables?.length) {
    return (
      <p className="text-sm text-muted-foreground">
        No tables yet.{' '}
        <Link to={`${base}/tables`} className="underline">
          Make one
        </Link>
        .
      </p>
    );
  }
  return (
    <div className="space-y-3">
      <NativeSelect
        aria-label="Table to roll"
        value={widget.tableId ?? ''}
        onChange={(event) => {
          setLast(null);
          onChange({ tableId: event.target.value || null });
        }}
      >
        <option value="">Choose a table…</option>
        {tables.map((table) => (
          <option key={table.id} value={table.id}>
            {table.name}
          </option>
        ))}
      </NativeSelect>
      {widget.tableId && !chosen ? (
        <p className="text-sm text-destructive">That table is gone. Choose another.</p>
      ) : null}
      <div className="flex flex-wrap items-center gap-3">
        <Button
          disabled={!chosen || chosen.rowCount === 0 || roll.isPending}
          onClick={() =>
            chosen &&
            roll.mutate(
              { tableId: chosen.id, visibility: share ? 'player' : 'gm' },
              { onSuccess: setLast, onError: (error) => toast.error(errorMessage(error)) },
            )
          }
        >
          <Dices /> Roll
        </Button>
        <label className="flex items-center gap-2 text-[13px] text-muted-foreground">
          <input
            type="checkbox"
            checked={share}
            onChange={(event) => setShare(event.target.checked)}
            className="size-4 accent-primary"
          />
          Show to the players
        </label>
      </div>
      {last ? (
        <div className="rounded-lg border bg-muted/40 p-3 text-sm" aria-live="polite">
          <RollResult entry={last} />
        </div>
      ) : null}
    </div>
  );
}

function EntriesWidget({
  widget,
  lookup,
  onPick,
  onChange,
}: {
  widget: Extract<GmWidget, { type: 'entries' }>;
  lookup: (id: string) => Pick<EntitySummary, 'id' | 'name' | 'typeId'> & { summary?: string };
  onPick: (entity: PickedEntity) => void;
  onChange: (patch: Partial<typeof widget>) => void;
}) {
  const { base, typeById } = useWorld();
  return (
    <div className="space-y-2">
      {widget.entityIds.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Pin the characters, places and items you need at hand.
        </p>
      ) : (
        <ul className="space-y-1.5">
          {widget.entityIds.map((id) => {
            const entry = lookup(id);
            const type = typeById.get(entry.typeId);
            return (
              <li key={id} className="flex items-start gap-2 rounded-md border bg-card p-2 text-sm">
                <EntityIcon
                  icon={type?.icon ?? 'file-text'}
                  color={type?.color}
                  className="mt-0.5"
                />
                <div className="min-w-0 flex-1">
                  <Link to={`${base}/e/${id}`} className="font-medium hover:underline">
                    {entry.name}
                  </Link>
                  {entry.summary ? (
                    <p className="line-clamp-2 text-[13px] text-muted-foreground">
                      {entry.summary}
                    </p>
                  ) : null}
                </div>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label={`Unpin ${entry.name}`}
                  onClick={() => onChange({ entityIds: widget.entityIds.filter((e) => e !== id) })}
                >
                  <X />
                </Button>
              </li>
            );
          })}
        </ul>
      )}
      {widget.entityIds.length < MAX_PINNED_ENTRIES ? (
        <EntityPicker
          onSelect={(entity) => {
            if (widget.entityIds.includes(entity.id)) return;
            onPick(entity);
            onChange({ entityIds: [...widget.entityIds, entity.id] });
          }}
          trigger={
            <Button variant="outline" size="sm">
              <Plus /> Pin an entry
            </Button>
          }
        />
      ) : null}
    </div>
  );
}

function ClockWidget({
  widget,
  onChange,
}: {
  widget: Extract<GmWidget, { type: 'clock' }>;
  onChange: (patch: Partial<typeof widget>) => void;
}) {
  return (
    <div className="space-y-3">
      <div
        role="group"
        aria-label={`Clock, ${widget.filled} of ${widget.segments} filled`}
        className="flex flex-wrap gap-1.5"
      >
        {Array.from({ length: widget.segments }, (_, i) => (
          <button
            key={i}
            type="button"
            aria-label={`Segment ${i + 1}`}
            aria-pressed={i < widget.filled}
            // Clicking the last filled segment takes it back.
            onClick={() => onChange({ filled: widget.filled === i + 1 ? i : i + 1 })}
            className={cn(
              'h-8 min-w-8 flex-1 rounded-md border transition-colors',
              i < widget.filled ? 'border-primary bg-primary' : 'bg-card hover:bg-muted',
            )}
          />
        ))}
      </div>
      <div className="flex items-center gap-2 text-[13px] text-muted-foreground">
        <span className="tabular-nums">
          {widget.filled} / {widget.segments}
        </span>
        <NativeSelect
          aria-label="Segments"
          className="ml-auto h-8 w-auto text-[13px]"
          value={widget.segments}
          onChange={(event) => {
            const segments = Number(event.target.value);
            onChange({ segments, filled: Math.min(widget.filled, segments) });
          }}
        >
          {CLOCK_SEGMENT_CHOICES.map((n) => (
            <option key={n} value={n}>
              {n} segments
            </option>
          ))}
        </NativeSelect>
        <Button variant="ghost" size="sm" onClick={() => onChange({ filled: 0 })}>
          Reset
        </Button>
      </div>
    </div>
  );
}

function SessionWidget() {
  const { world, base, typeById } = useWorld();
  const { data: sessions, isPending } = useSessions(world.id);
  if (isPending) return <Spinner />;
  // The one being prepared: the highest-numbered planned session, else the latest played.
  const current = sessions?.find((s) => s.status !== 'Played') ?? sessions?.[0];
  if (!current) {
    return (
      <p className="text-sm text-muted-foreground">
        No sessions yet.{' '}
        <Link to={`${base}/sessions`} className="underline">
          Start one
        </Link>
        .
      </p>
    );
  }
  return (
    <div className="space-y-2 text-sm">
      <Link
        to={`${base}/e/${current.id}`}
        className="font-serif text-lg font-semibold hover:underline"
      >
        {current.number !== null ? `${current.number}. ` : ''}
        {current.name}
      </Link>
      <p className="text-muted-foreground">
        {current.status === 'Played' ? 'Played' : 'Planned'}
        {current.playedOn ? `, ${current.playedOn}` : ''}
      </p>
      {current.summary ? <p>{current.summary}</p> : null}
      {current.links.length > 0 ? (
        <ul className="flex flex-wrap gap-1">
          {current.links.map((link) => {
            const type = typeById.get(link.other.typeId);
            return (
              <li key={`${link.label}-${link.other.id}`}>
                <Link
                  to={`${base}/e/${link.other.id}`}
                  className="inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs hover:bg-muted"
                >
                  <EntityIcon
                    icon={type?.icon ?? 'file-text'}
                    color={type?.color}
                    className="size-3"
                  />
                  {link.other.name}
                </Link>
              </li>
            );
          })}
        </ul>
      ) : null}
      <Link
        to={`${base}/sessions`}
        className="inline-block text-xs text-muted-foreground underline"
      >
        All sessions
      </Link>
    </div>
  );
}

// ---- The frame around each widget -------------------------------------------------------------

function WidgetFrame({
  widget,
  first,
  last,
  onTitle,
  onMove,
  onRemove,
  children,
}: {
  widget: GmWidget;
  first: boolean;
  last: boolean;
  onTitle: (title: string) => void;
  onMove: (by: -1 | 1) => void;
  onRemove: () => void;
  children: ReactNode;
}) {
  const label = GM_WIDGET_LABELS[widget.type];
  return (
    <section
      aria-label={widget.title || label}
      className="space-y-3 rounded-xl border bg-card p-3 shadow-xs"
    >
      <header className="flex items-center gap-1.5">
        <span className="text-muted-foreground [&_svg]:size-4">{WIDGET_ICONS[widget.type]}</span>
        <Input
          aria-label={`Title of ${label}`}
          value={widget.title}
          placeholder={label}
          maxLength={80}
          onChange={(event) => onTitle(event.target.value)}
          className="h-8 border-transparent bg-transparent px-1.5 font-medium shadow-none hover:border-input focus-visible:bg-card"
        />
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label={`Move ${widget.title || label} earlier`}
          disabled={first}
          onClick={() => onMove(-1)}
        >
          <ArrowUp />
        </Button>
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label={`Move ${widget.title || label} later`}
          disabled={last}
          onClick={() => onMove(1)}
        >
          <ArrowDown />
        </Button>
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label={`Remove ${widget.title || label}`}
          onClick={onRemove}
        >
          <X />
        </Button>
      </header>
      {children}
    </section>
  );
}

// ---- The page ---------------------------------------------------------------------------------

function ScreenEditor({ screen }: { screen: GmScreen }) {
  const { world } = useWorld();
  const save = useSaveGmScreen(world.id);
  const [widgets, setWidgets] = useState<GmWidget[]>(screen.widgets);
  // Entries picked this visit, so a pin shows its name before the save has resolved it.
  const [picked, setPicked] = useState<Map<string, PickedEntity>>(new Map());
  const saved = useRef(JSON.stringify(screen.widgets));
  const latest = useRef(widgets);
  const flushRef = useRef<() => void>(() => {});

  const flush = () => {
    const json = JSON.stringify(latest.current);
    if (json === saved.current) return;
    saved.current = json;
    save.mutate(latest.current, {
      onError: (error) => {
        // Forget it was saved, so the next change (or a retry) sends it again.
        saved.current = '';
        toast.error(`The screen was not saved: ${errorMessage(error)}`);
      },
    });
  };

  useEffect(() => {
    latest.current = widgets;
    flushRef.current = flush;
  });

  // Save a moment after the last change, and once more when leaving the page.
  const settled = useDebounced(widgets, 700);
  useEffect(() => {
    flushRef.current();
  }, [settled]);
  useEffect(() => () => flushRef.current(), []);

  const entriesById = new Map(screen.entries.map((entry) => [entry.id, entry]));
  const lookup = (id: string) =>
    entriesById.get(id) ?? picked.get(id) ?? { id, name: 'Unavailable entry', typeId: '' };

  const change = (id: string, patch: Partial<GmWidget>) =>
    setWidgets((list) => list.map((w) => (w.id === id ? ({ ...w, ...patch } as GmWidget) : w)));
  const move = (index: number, by: -1 | 1) =>
    setWidgets((list) => {
      const next = [...list];
      const [item] = next.splice(index, 1);
      next.splice(index + by, 0, item!);
      return next;
    });

  // `settled` trails `widgets` by the debounce, so the two differ while a change is waiting.
  const status = save.isError
    ? 'Not saved'
    : widgets !== settled || save.isPending
      ? 'Saving…'
      : 'Saved';

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-sm font-medium text-muted-foreground">Game tools</p>
          <h1 className="font-serif text-3xl font-semibold">GM screen</h1>
          <p className="mt-1 text-muted-foreground">
            Your own table-side view. Only you see it, and it saves as you go.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-[13px] text-muted-foreground" aria-live="polite">
            {status}
          </span>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button disabled={widgets.length >= MAX_GM_WIDGETS}>
                <Plus /> Add widget
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent>
              {GM_WIDGET_TYPES.map((type) => (
                <DropdownMenuItem
                  key={type}
                  onSelect={() => setWidgets((list) => [...list, blankWidget(type)])}
                >
                  {WIDGET_ICONS[type]} {GM_WIDGET_LABELS[type]}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {widgets.length === 0 ? (
        <EmptyState icon={<LayoutDashboard />} title="An empty screen">
          <p>
            Add dice, a table roller, pinned entries, a scratchpad, a clock or the current session.
          </p>
        </EmptyState>
      ) : (
        <div className="grid items-start gap-4 md:grid-cols-2 2xl:grid-cols-3">
          {widgets.map((widget, index) => (
            <WidgetFrame
              key={widget.id}
              widget={widget}
              first={index === 0}
              last={index === widgets.length - 1}
              onTitle={(title) => change(widget.id, { title })}
              onMove={(by) => move(index, by)}
              onRemove={() => setWidgets((list) => list.filter((w) => w.id !== widget.id))}
            >
              {widget.type === 'dice' ? <RollPanel compact /> : null}
              {widget.type === 'table' ? (
                <TableWidget widget={widget} onChange={(patch) => change(widget.id, patch)} />
              ) : null}
              {widget.type === 'entries' ? (
                <EntriesWidget
                  widget={widget}
                  lookup={lookup}
                  onPick={(entity) => setPicked((map) => new Map(map).set(entity.id, entity))}
                  onChange={(patch) => change(widget.id, patch)}
                />
              ) : null}
              {widget.type === 'notes' ? (
                <Textarea
                  aria-label={`Text of ${widget.title || GM_WIDGET_LABELS.notes}`}
                  value={widget.text}
                  maxLength={MAX_SCRATCHPAD}
                  onChange={(event) => change(widget.id, { text: event.target.value })}
                  placeholder="Initiative, names you made up on the spot, what the party just promised…"
                  className="min-h-40"
                />
              ) : null}
              {widget.type === 'clock' ? (
                <ClockWidget widget={widget} onChange={(patch) => change(widget.id, patch)} />
              ) : null}
              {widget.type === 'session' ? <SessionWidget /> : null}
            </WidgetFrame>
          ))}
        </div>
      )}
    </div>
  );
}

export function ScreenPage() {
  const { world } = useWorld();
  const { data: screen, isPending, error } = useGmScreen(world.id);
  if (isPending) return <PageSpinner />;
  if (error || !screen) {
    return (
      <EmptyState icon={<LayoutDashboard />} title="The GM screen is for the GM">
        <p>{error ? errorMessage(error) : 'Switch back to your own view to use it.'}</p>
      </EmptyState>
    );
  }
  return <ScreenEditor screen={screen} />;
}

export { ScreenPage as Component };
