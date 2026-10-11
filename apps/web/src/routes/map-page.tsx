import {
  Check,
  ChevronRight,
  Maximize,
  MapPin,
  MousePointer2,
  Pentagon,
  RotateCcw,
  Route,
  Settings,
  Type,
  Undo2,
  X,
  type LucideIcon,
} from 'lucide-react';
import { useEffect, useEffectEvent, useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router';
import { toast } from 'sonner';
import {
  FEATURE_POINT_LIMITS,
  FEATURE_KIND_LABELS,
  type AtlasMap,
  type FeatureKind,
  type FeatureUpdateInput,
  type MapPoint,
} from '@atlas/shared';
import {
  useCreateFeature,
  useDeleteFeature,
  useMap,
  useMapFeatures,
  useMaps,
  useRetryMap,
  useUpdateFeature,
} from '@/api/atlas-queries';
import { errorMessage } from '@/api/client';
import { FeaturePanel } from '@/components/atlas/feature-panel';
import { MapCanvas, type FocusRequest, type MapTool } from '@/components/atlas/map-canvas';
import { MapInfoPanel } from '@/components/atlas/map-info-panel';
import { MapSettingsDialog } from '@/components/atlas/map-settings-dialog';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/inputs';
import { EmptyState, PageSpinner, Spinner } from '@/components/ui/misc';
import { mapPath } from '@/lib/atlas-tree';
import { useWorld } from '@/lib/world-context';

const TOOLS: { tool: MapTool; label: string; icon: LucideIcon }[] = [
  { tool: 'select', label: 'Select', icon: MousePointer2 },
  { tool: 'pin', label: 'Pin', icon: MapPin },
  { tool: 'label', label: 'Label', icon: Type },
  { tool: 'path', label: 'Path', icon: Route },
  { tool: 'region', label: 'Region', icon: Pentagon },
];

const isDrawing = (tool: MapTool): tool is 'path' | 'region' =>
  tool === 'path' || tool === 'region';

/** Corners drawn almost on top of each other (the second click of a double-click) count once. */
function dedupe(points: MapPoint[]): MapPoint[] {
  return points.filter((p, i) => {
    const previous = points[i - 1];
    return !previous || Math.hypot(p[0] - previous[0], p[1] - previous[1]) > 0.0005;
  });
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
  const { world, typeById, canEdit, base } = useWorld();
  const navigate = useNavigate();
  const featuresQuery = useMapFeatures(world.id, map.id);
  const features = featuresQuery.data ?? [];
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

  function chooseTool(next: MapTool) {
    setTool(next);
    setDraft([]);
    if (next !== 'select') setPicked(null);
  }

  async function create(kind: FeatureKind, points: MapPoint[], label = '') {
    try {
      const feature = await createFeature.mutateAsync({ kind, points, label });
      setPicked(feature.id);
      setNewlyCreated(feature.id);
      setTool('select');
      setDraft([]);
    } catch (error) {
      toast.error(errorMessage(error));
    }
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
    } else if (event.key === 'Backspace' && drawing && draft.length > 0) {
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
            fitRequest={fitRequest}
            onSelect={setPicked}
            onPlace={(kind, point) =>
              kind === 'pin' ? void create('pin', [point]) : setLabelAt(point)
            }
            onDraftAdd={(point) => setDraft((points) => [...points, point])}
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
        {selected ? (
          <FeaturePanel
            key={selected.id}
            feature={selected}
            map={map}
            maps={maps}
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
