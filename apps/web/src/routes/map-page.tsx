import {
  CalendarClock,
  Check,
  ChevronRight,
  Circle,
  Footprints,
  Maximize,
  MapPin,
  MousePointer2,
  MoveUpRight,
  Pentagon,
  RotateCcw,
  Route,
  Ruler,
  Settings,
  Type,
  Undo2,
  X,
  type LucideIcon,
} from 'lucide-react';
import { useEffect, useEffectEvent, useMemo, useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router';
import { toast } from 'sonner';
import {
  FEATURE_POINT_LIMITS,
  FEATURE_KIND_LABELS,
  formatDistance,
  pathLength,
  type AtlasMap,
  type FeatureKind,
  type FeatureUpdateInput,
  type MapLayer,
  type MapPoint,
} from '@atlas/shared';
import {
  useCreateFeature,
  useDeleteFeature,
  useMap,
  useMapFeatures,
  useMapLayers,
  useMaps,
  useRetryMap,
  useUpdateFeature,
} from '@/api/atlas-queries';
import { errorMessage } from '@/api/client';
import { FeaturePanel } from '@/components/atlas/feature-panel';
import { LayersMenu } from '@/components/atlas/layers-menu';
import { MapCanvas, type FocusRequest, type MapTool } from '@/components/atlas/map-canvas';
import { MapInfoPanel } from '@/components/atlas/map-info-panel';
import { MapSettingsDialog } from '@/components/atlas/map-settings-dialog';
import { MeasurePanel } from '@/components/atlas/measure-panel';
import { DateField } from '@/components/date-field';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogFooter } from '@/components/ui/dialog';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Input } from '@/components/ui/inputs';
import { EmptyState, PageSpinner, Spinner } from '@/components/ui/misc';
import { mapPath } from '@/lib/atlas-tree';
import { useDates } from '@/lib/use-dates';
import { useWorld } from '@/lib/world-context';

const TOOLS: { tool: MapTool; label: string; icon: LucideIcon }[] = [
  // Placed first so the list below reads from simple marks to richer shapes.
  { tool: 'select', label: 'Select', icon: MousePointer2 },
  { tool: 'pin', label: 'Pin', icon: MapPin },
  { tool: 'label', label: 'Label', icon: Type },
  { tool: 'path', label: 'Path', icon: Route },
  { tool: 'region', label: 'Region', icon: Pentagon },
  { tool: 'journey', label: 'Journey', icon: Footprints },
  { tool: 'arrow', label: 'Arrow', icon: MoveUpRight },
  { tool: 'circle', label: 'Circle', icon: Circle },
];

/** Read the map at an in-world date: features that do not hold then drop away. */
function MapAsOf({
  value,
  onChange,
}: {
  value: number | null;
  onChange: (day: number | null) => void;
}) {
  const dates = useDates();
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant={value === null ? 'ghost' : 'default'}
          size="sm"
          title="Read the map at a date"
        >
          <CalendarClock />
          <span className="hidden sm:inline">
            {value === null ? 'As of…' : `As of ${dates.date(value)}`}
          </span>
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 space-y-3">
        <p className="text-sm text-muted-foreground">
          Borders, roads and journeys that hold on a date. Map items can be given a start and an
          end; journeys show how far along they are.
        </p>
        <DateField label="Date" value={value} onChange={onChange} />
        {value !== null ? (
          <Button type="button" size="sm" variant="outline" onClick={() => onChange(null)}>
            <X /> Back to now
          </Button>
        ) : null}
      </PopoverContent>
    </Popover>
  );
}

type DrawingTool = 'path' | 'region' | 'journey' | 'arrow' | 'circle';
const isDrawing = (tool: MapTool): tool is DrawingTool =>
  tool === 'path' ||
  tool === 'region' ||
  tool === 'journey' ||
  tool === 'arrow' ||
  tool === 'circle';
/** Shapes that are finished by their second click. */
const isTwoPoint = (tool: MapTool) => tool === 'arrow' || tool === 'circle';

/** Corners drawn almost on top of each other (the second click of a double-click) count once. */
function dedupe(points: MapPoint[]): MapPoint[] {
  return points.filter((p, i) => {
    const previous = points[i - 1];
    return !previous || Math.hypot(p[0] - previous[0], p[1] - previous[1]) > 0.0005;
  });
}

const EMPTY_LAYERS: MapLayer[] = [];

/** Which layers this viewer switched on or off, remembered per map in this browser. */
function readLayerChoices(mapId: string): Record<string, boolean> {
  try {
    const raw = localStorage.getItem(`atlas.layers.${mapId}`);
    return raw ? (JSON.parse(raw) as Record<string, boolean>) : {};
  } catch {
    return {};
  }
}

function Breadcrumbs({ map, maps }: { map: AtlasMap; maps: AtlasMap[] }) {
  const { base } = useWorld();
  const path = mapPath(maps, map.id);
  const trail = path.length > 0 ? path : [map];
  return (
    <nav aria-label="Breadcrumb" className="flex min-w-0 items-center gap-1 text-sm">
      <Link to={`${base}/atlas`} className="shrink-0 text-muted-foreground hover:text-foreground">
        Atlas
      </Link>
      {trail.map((item, index) => (
        <span key={item.id} className="flex min-w-0 items-center gap-1">
          <ChevronRight className="size-3.5 shrink-0 text-muted-foreground" />
          {index === trail.length - 1 ? (
            <span className="truncate font-medium" aria-current="page">
              {item.name}
            </span>
          ) : (
            <Link
              to={`${base}/atlas/${item.id}`}
              className="max-w-40 truncate text-muted-foreground hover:text-foreground"
            >
              {item.name}
            </Link>
          )}
        </span>
      ))}
    </nav>
  );
}

function MapWorkspace({
  map,
  maps,
  initialFeatureId,
}: {
  map: AtlasMap;
  maps: AtlasMap[];
  initialFeatureId: string | null;
}) {
  const { world, typeById, canEdit: canEditWorld, base } = useWorld();
  // Reading the map at a date is a view, not a place to draw.
  const [asOf, setAsOf] = useState<number | null>(null);
  const canEdit = canEditWorld && asOf === null;
  const navigate = useNavigate();
  const featuresQuery = useMapFeatures(world.id, map.id, true, asOf);
  const features = featuresQuery.data ?? [];
  const layers = useMapLayers(world.id, map.id).data ?? EMPTY_LAYERS;
  const [layerChoices, setLayerChoices] = useState(() => readLayerChoices(map.id));
  const hiddenLayers = useMemo(
    () =>
      new Set(layers.filter((l) => !(layerChoices[l.id] ?? l.visibleByDefault)).map((l) => l.id)),
    [layers, layerChoices],
  );
  const createFeature = useCreateFeature(world.id, map.id);
  const updateFeature = useUpdateFeature(world.id, map.id);
  const deleteFeature = useDeleteFeature(world.id, map.id);

  const [tool, setTool] = useState<MapTool>('select');
  const [draft, setDraft] = useState<MapPoint[]>([]);
  // `undefined` until something is clicked, so a feature from the link is selected to begin with.
  const [picked, setPicked] = useState<string | null | undefined>(undefined);
  const selectedId = picked === undefined ? initialFeatureId : picked;
  const [focus, setFocus] = useState<FocusRequest | null>(
    initialFeatureId ? { id: initialFeatureId, nonce: 0 } : null,
  );
  const [fitRequest, setFitRequest] = useState(0);
  const [newlyCreated, setNewlyCreated] = useState<string | null>(null);
  const [labelAt, setLabelAt] = useState<MapPoint | null>(null);

  const selected = features.find((f) => f.id === selectedId);
  const drawing = isDrawing(tool);
  const measuring = tool === 'measure';
  const measured = measuring && map.scale ? pathLength(draft, map, map.scale) : null;
  const measureLabel =
    measured !== null && map.scale && draft.length >= 2
      ? formatDistance(measured, map.scale.unit)
      : null;

  function toggleLayer(layerId: string) {
    const next = { ...layerChoices, [layerId]: hiddenLayers.has(layerId) };
    setLayerChoices(next);
    try {
      localStorage.setItem(`atlas.layers.${map.id}`, JSON.stringify(next));
    } catch {
      // Private windows can refuse storage; the choice then lasts until the page closes.
    }
  }

  function chooseTool(next: MapTool) {
    setTool(next);
    setDraft([]);
    if (next !== 'select') setPicked(null);
  }

  async function create(kind: FeatureKind, points: MapPoint[], label = '') {
    try {
      const feature = await createFeature.mutateAsync({
        kind,
        points,
        label,
        ...(kind === 'journey' ? { lineStyle: 'dashed' as const } : {}),
      });
      setPicked(feature.id);
      setNewlyCreated(feature.id);
      setTool('select');
      setDraft([]);
    } catch (error) {
      toast.error(errorMessage(error));
    }
  }

  function addDraftPoint(point: MapPoint) {
    // Arrows and circles take two points: the second click finishes them.
    if (isDrawing(tool) && isTwoPoint(tool) && draft.length === 1) {
      void create(tool, [draft[0]!, point]);
      return;
    }
    setDraft((points) => [...points, point]);
  }

  function finishDraft() {
    if (!drawing) return;
    const points = dedupe(draft);
    const { min } = FEATURE_POINT_LIMITS[tool];
    if (points.length < min) {
      toast.error(`A ${FEATURE_KIND_LABELS[tool].toLowerCase()} needs at least ${min} points`);
      return;
    }
    void create(tool, points);
  }

  function change(patch: FeatureUpdateInput) {
    if (!selected) return;
    updateFeature.mutate(
      { id: selected.id, ...patch },
      { onError: (error) => toast.error(errorMessage(error)) },
    );
  }

  function submitLabel(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const text = String(new FormData(event.currentTarget).get('text') ?? '').trim();
    if (!labelAt || !text) return;
    void create('label', [labelAt], text);
    setLabelAt(null);
  }

  const onKeyDown = useEffectEvent((event: KeyboardEvent) => {
    const target = event.target as HTMLElement | null;
    // Typing in a field, or a dialog already handling Escape, isn't ours.
    if (event.defaultPrevented || target?.closest('input, textarea, select, [contenteditable]')) {
      return;
    }
    if (event.key === 'Enter' && drawing) {
      finishDraft();
    } else if (event.key === 'Escape') {
      if (draft.length > 0) setDraft([]);
      else if (tool !== 'select') setTool('select');
      else setPicked(null);
    } else if (event.key === 'Backspace' && (drawing || measuring) && draft.length > 0) {
      event.preventDefault();
      setDraft((points) => points.slice(0, -1));
    }
  });
  useEffect(() => {
    const listener = (event: KeyboardEvent) => onKeyDown(event);
    window.addEventListener('keydown', listener);
    return () => window.removeEventListener('keydown', listener);
  }, []);

  const hint =
    tool === 'pin'
      ? 'Click the map to drop a pin.'
      : tool === 'label'
        ? 'Click the map where the text should go.'
        : measuring
          ? 'Click along your route to measure it.'
          : drawing
            ? draft.length === 0
              ? `Click to start the ${FEATURE_KIND_LABELS[tool].toLowerCase()}.`
              : 'Keep clicking to add points. Double-click or press Enter to finish.'
            : null;

  return (
    <div className="flex h-[calc(100dvh-3.5rem)] flex-col lg:h-dvh lg:flex-row">
      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        <header className="flex flex-wrap items-center gap-x-4 gap-y-1 border-b bg-background px-3 py-2">
          <div className="min-w-0 flex-1 basis-48">
            <Breadcrumbs map={map} maps={maps} />
          </div>
          {canEdit ? (
            <div role="toolbar" aria-label="Map tools" className="flex items-center gap-0.5">
              {TOOLS.map(({ tool: value, label, icon: Icon }) => (
                <Button
                  key={value}
                  variant={tool === value ? 'default' : 'ghost'}
                  size="sm"
                  aria-pressed={tool === value}
                  title={label}
                  onClick={() => chooseTool(value)}
                >
                  <Icon />
                  <span className="hidden sm:inline">{label}</span>
                </Button>
              ))}
            </div>
          ) : null}
          <div className="flex items-center gap-0.5">
            <Button
              variant={measuring ? 'default' : 'ghost'}
              size="sm"
              aria-pressed={measuring}
              title="Measure distances"
              aria-label="Measure"
              onClick={() => chooseTool(measuring ? 'select' : 'measure')}
            >
              <Ruler />
              <span className="hidden sm:inline">Measure</span>
            </Button>
            <MapAsOf value={asOf} onChange={setAsOf} />
            <LayersMenu
              mapId={map.id}
              layers={layers}
              hidden={hiddenLayers}
              canEdit={canEdit}
              onToggle={toggleLayer}
            />
            <Button variant="ghost" size="icon-sm" onClick={() => setFitRequest((n) => n + 1)}>
              <Maximize />
              <span className="sr-only">Show the whole map</span>
            </Button>
            {canEdit ? (
              <MapSettingsDialog
                map={map}
                maps={maps}
                trigger={
                  <Button variant="ghost" size="icon-sm">
                    <Settings />
                    <span className="sr-only">Map settings</span>
                  </Button>
                }
              />
            ) : null}
          </div>
        </header>

        <div className="relative min-h-0 flex-1">
          <MapCanvas
            worldId={world.id}
            map={map}
            features={features}
            typeById={typeById}
            tool={tool}
            canEdit={canEdit}
            selectedId={selectedId ?? null}
            focus={focus}
            draft={draft}
            hiddenLayers={hiddenLayers}
            measureLabel={measureLabel}
            fitRequest={fitRequest}
            asOfDay={asOf}
            onSelect={setPicked}
            onPlace={(kind, point) =>
              kind === 'pin' ? void create('pin', [point]) : setLabelAt(point)
            }
            onDraftAdd={addDraftPoint}
            onDraftFinish={finishDraft}
            onMovePoints={(id, points) =>
              updateFeature.mutate(
                { id, points },
                { onError: (error) => toast.error(errorMessage(error)) },
              )
            }
            onOpenMap={(id) => void navigate(`${base}/atlas/${id}`)}
          />

          {hint ? (
            <div className="pointer-events-none absolute inset-x-0 bottom-4 z-10 flex justify-center px-3">
              <div className="pointer-events-auto flex flex-wrap items-center justify-center gap-2 rounded-lg border bg-card/95 px-3 py-2 text-sm shadow-lg backdrop-blur">
                <span>{hint}</span>
                {drawing && draft.length > 0 ? (
                  <>
                    <Button size="sm" onClick={finishDraft}>
                      <Check /> Finish
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setDraft((p) => p.slice(0, -1))}
                    >
                      <Undo2 /> Undo
                    </Button>
                  </>
                ) : null}
                <Button size="sm" variant="ghost" onClick={() => chooseTool('select')}>
                  <X /> Cancel
                </Button>
              </div>
            </div>
          ) : null}

          {featuresQuery.isPending ? (
            <div className="absolute right-3 top-3 z-10 rounded-full border bg-card p-1.5 shadow">
              <Spinner />
            </div>
          ) : null}
        </div>
      </div>

      <aside className="max-h-[42dvh] shrink-0 overflow-y-auto border-t bg-sidebar lg:max-h-none lg:w-[340px] lg:border-l lg:border-t-0">
        {measuring ? (
          <MeasurePanel
            map={map}
            points={draft}
            canEdit={canEdit}
            onUndo={() => setDraft((points) => points.slice(0, -1))}
            onClear={() => setDraft([])}
            onSaveAsPath={() => void create('path', dedupe(draft))}
          />
        ) : selected ? (
          <FeaturePanel
            key={selected.id}
            feature={selected}
            map={map}
            maps={maps}
            layers={layers}
            canEdit={canEdit}
            autoFocusLabel={newlyCreated === selected.id}
            onChange={change}
            onClose={() => setPicked(null)}
            onDelete={async () => {
              try {
                await deleteFeature.mutateAsync(selected.id);
                setPicked(null);
              } catch (error) {
                toast.error(errorMessage(error));
              }
            }}
          />
        ) : (
          <MapInfoPanel
            map={map}
            maps={maps}
            features={features}
            canEdit={canEdit}
            onPick={(id) => {
              setPicked(id);
              setFocus((current) => ({ id, nonce: (current?.nonce ?? 0) + 1 }));
            }}
          />
        )}
      </aside>

      <Dialog open={labelAt !== null} onOpenChange={(open) => !open && setLabelAt(null)}>
        <DialogContent title="Text label" description="Names a sea, a kingdom, a mountain range…">
          <form onSubmit={submitLabel} className="space-y-4">
            <Input name="text" required maxLength={120} autoFocus aria-label="Label text" />
            <DialogFooter className="mt-0">
              <Button type="submit">Add label</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Unfinished({ map, maps }: { map: AtlasMap; maps: AtlasMap[] }) {
  const { world, canEdit, base } = useWorld();
  const retry = useRetryMap(world.id);
  return (
    <div className="mx-auto max-w-xl space-y-6 px-4 py-10">
      <Breadcrumbs map={map} maps={maps} />
      {map.status === 'processing' ? (
        <EmptyState icon={<Spinner className="size-8" />} title="Preparing your map">
          <p>
            {map.name} is being cut into tiles so it zooms smoothly. Large maps can take a few
            minutes. This page opens the map as soon as it is ready.
          </p>
        </EmptyState>
      ) : (
        <EmptyState icon={<RotateCcw />} title="This map could not be prepared">
          <p>{map.error || 'Something went wrong while cutting the image into tiles.'}</p>
          {canEdit ? (
            <div className="mt-4 flex justify-center gap-2">
              <Button
                disabled={retry.isPending}
                onClick={() =>
                  retry.mutate(map.id, { onError: (error) => toast.error(errorMessage(error)) })
                }
              >
                Try again
              </Button>
              <MapSettingsDialog
                map={map}
                maps={maps}
                trigger={<Button variant="outline">Settings</Button>}
              />
            </div>
          ) : null}
        </EmptyState>
      )}
      <Button asChild variant="ghost">
        <Link to={`${base}/atlas`}>Back to the Atlas</Link>
      </Button>
    </div>
  );
}

export function MapPage() {
  const { mapId = '' } = useParams();
  const { world, base } = useWorld();
  const [searchParams] = useSearchParams();
  const mapQuery = useMap(world.id, mapId);
  const { data: maps = [] } = useMaps(world.id);

  if (mapQuery.isError) {
    return (
      <div className="mx-auto max-w-md px-4 py-24">
        <EmptyState title="Map not found">
          <p>It may have been deleted.</p>
          <Button asChild variant="outline" className="mt-4">
            <Link to={`${base}/atlas`}>Back to the Atlas</Link>
          </Button>
        </EmptyState>
      </div>
    );
  }
  const map = mapQuery.data;
  if (!map) return <PageSpinner />;
  if (map.status !== 'ready') return <Unfinished map={map} maps={maps} />;

  const featureId = searchParams.get('feature');
  return (
    // A link to a different pin restarts the workspace, which selects and shows it.
    <MapWorkspace
      key={`${map.id}:${featureId ?? ''}`}
      map={map}
      maps={maps}
      initialFeatureId={featureId}
    />
  );
}

export { MapPage as Component };
