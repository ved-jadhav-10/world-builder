import { Focus, GitFork, Maximize2, Network, Tag as TagIcon, ZoomIn, ZoomOut } from 'lucide-react';
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from 'react';
import { Link, useSearchParams } from 'react-router';
import { layoutGraph, type GraphEdge, type GraphNode } from '@atlas/shared';
import { useGraph } from '@/api/graph-queries';
import { useRelationshipTypes } from '@/api/queries';
import { EntityIcon } from '@/components/entity-icon';
import { EntityPicker } from '@/components/entity-picker';
import { Button } from '@/components/ui/button';
import { NativeSelect } from '@/components/ui/inputs';
import { EmptyState, PageSpinner } from '@/components/ui/misc';
import { cn } from '@/lib/utils';
import { useWorld } from '@/lib/world-context';

const VB_W = 1000;
const VB_H = 700;
const MIN_ZOOM = 0.3;
const MAX_ZOOM = 6;
const FALLBACK_COLOR = '#64748b';

interface View {
  x: number;
  y: number;
  k: number;
}
const HOME: View = { x: 0, y: 0, k: 1 };

const radiusOf = (node: GraphNode) => 7 + Math.min(11, Math.sqrt(node.degree) * 2.2);

/** Pan by dragging, zoom with the wheel (or the buttons). Returns what the SVG needs. */
function usePanZoom(svg: SVGSVGElement | null) {
  const [view, setView] = useState<View>(HOME);
  const drag = useRef<{ x: number; y: number; view: View; moved: boolean } | null>(null);

  const zoomAt = (factor: number, clientX?: number, clientY?: number) => {
    setView((v) => {
      const k = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, v.k * factor));
      let px = VB_W / 2;
      let py = VB_H / 2;
      const ctm = svg?.getScreenCTM();
      if (svg && ctm && clientX !== undefined && clientY !== undefined) {
        const point = svg.createSVGPoint();
        point.x = clientX;
        point.y = clientY;
        const local = point.matrixTransform(ctm.inverse());
        px = local.x;
        py = local.y;
      }
      // Keep the point under the cursor where it is.
      return { k, x: px - (px - v.x) * (k / v.k), y: py - (py - v.y) * (k / v.k) };
    });
  };

  // Wheel zoom needs a non-passive listener, or the page scrolls as well.
  useEffect(() => {
    if (!svg) return;
    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      zoomAt(event.deltaY < 0 ? 1.15 : 1 / 1.15, event.clientX, event.clientY);
    };
    svg.addEventListener('wheel', onWheel, { passive: false });
    return () => svg.removeEventListener('wheel', onWheel);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- zoomAt only uses the svg and setState
  }, [svg]);

  const handlers = {
    onPointerDown: (event: ReactPointerEvent<SVGSVGElement>) => {
      // The pointer is captured only once it moves: capturing now would send the click that
      // follows to the background instead of to the entry that was pressed.
      drag.current = { x: event.clientX, y: event.clientY, view, moved: false };
    },
    onPointerMove: (event: ReactPointerEvent<SVGSVGElement>) => {
      const d = drag.current;
      const ctm = svg?.getScreenCTM();
      if (!d || !ctm) return;
      const dx = (event.clientX - d.x) / ctm.a;
      const dy = (event.clientY - d.y) / ctm.d;
      if (!d.moved && Math.abs(dx) + Math.abs(dy) > 3) {
        d.moved = true;
        event.currentTarget.setPointerCapture(event.pointerId);
      }
      if (!d.moved) return;
      setView({ ...d.view, x: d.view.x + dx, y: d.view.y + dy });
    },
    onPointerUp: () => {
      // A short delay, so the click that follows a drag can tell it was a drag.
      setTimeout(() => (drag.current = null), 0);
    },
  };
  return {
    view,
    setView,
    handlers,
    wasDrag: () => drag.current?.moved ?? false,
    zoomIn: () => zoomAt(1.3),
    zoomOut: () => zoomAt(1 / 1.3),
    reset: () => setView(HOME),
  };
}

export function GraphPage() {
  const { world, base, typeById, audience } = useWorld();
  const [params, setParams] = useSearchParams();
  const focus = params.get('focus');
  const depth = Math.min(3, Math.max(1, Number(params.get('depth')) || 2));
  const { data, isPending, isError } = useGraph(world.id, { focus, depth, limit: 150 });
  const { data: relTypes } = useRelationshipTypes(world.id);

  const [hiddenTypes, setHiddenTypes] = useState<Set<string>>(new Set());
  const [hiddenLinks, setHiddenLinks] = useState<Set<string>>(new Set());
  const [labels, setLabels] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [hoverId, setHoverId] = useState<string | null>(null);
  const [svgEl, setSvgEl] = useState<SVGSVGElement | null>(null);
  const pan = usePanZoom(svgEl);

  const setFocus = (id: string | null) => {
    const next = new URLSearchParams(params);
    if (id) next.set('focus', id);
    else next.delete('focus');
    setParams(next);
    setSelectedId(null);
    pan.reset();
  };

  // The picture after the type filters. The focus entry is always kept.
  const shown = useMemo(() => {
    if (!data) return null;
    const nodes = data.nodes.filter((n) => n.id === data.focusId || !hiddenTypes.has(n.typeId));
    const ids = new Set(nodes.map((n) => n.id));
    const edges = data.edges.filter(
      (e) => ids.has(e.sourceId) && ids.has(e.targetId) && !hiddenLinks.has(e.typeId),
    );
    return { nodes, edges };
  }, [data, hiddenTypes, hiddenLinks]);

  const placed = useMemo(() => {
    if (!shown) return new Map<string, { x: number; y: number }>();
    const positions = layoutGraph(shown.nodes, shown.edges, {
      width: VB_W,
      height: VB_H,
      pinnedId: data?.focusId ?? null,
    });
    return new Map(positions.map((p) => [p.id, p]));
  }, [shown, data?.focusId]);

  const byId = useMemo(() => new Map(data?.nodes.map((n) => [n.id, n])), [data]);
  const neighbours = useMemo(() => {
    const map = new Map<string, Set<string>>();
    for (const e of shown?.edges ?? []) {
      map.set(e.sourceId, (map.get(e.sourceId) ?? new Set()).add(e.targetId));
      map.set(e.targetId, (map.get(e.targetId) ?? new Set()).add(e.sourceId));
    }
    return map;
  }, [shown]);

  const spotlight = hoverId ?? selectedId;
  const lit = (id: string) =>
    spotlight === null || id === spotlight || neighbours.get(spotlight)?.has(id) === true;

  const typesPresent = useMemo(() => {
    const seen = new Map<string, number>();
    for (const n of data?.nodes ?? []) seen.set(n.typeId, (seen.get(n.typeId) ?? 0) + 1);
    return [...seen.entries()].sort((a, b) => b[1] - a[1]);
  }, [data]);
  const linkTypesPresent = useMemo(() => {
    const seen = new Map<string, number>();
    for (const e of data?.edges ?? []) seen.set(e.typeId, (seen.get(e.typeId) ?? 0) + 1);
    return [...seen.entries()].sort((a, b) => b[1] - a[1]);
  }, [data]);

  const toggle = (set: Set<string>, id: string) => {
    const next = new Set(set);
    if (!next.delete(id)) next.add(id);
    return next;
  };

  if (isPending) return <PageSpinner />;
  if (isError || !data || !shown) {
    return (
      <EmptyState icon={<Network />} title="The graph is not available">
        <p>That entry may have been deleted, or it is not shared with you.</p>
        <Button variant="outline" className="mt-4" onClick={() => setFocus(null)}>
          Show the whole world
        </Button>
      </EmptyState>
    );
  }

  const focusNode = data.focusId ? byId.get(data.focusId) : undefined;
  const selected = selectedId ? byId.get(selectedId) : undefined;
  const selectedLinks: { edge: GraphEdge; otherId: string; label: string }[] = selected
    ? shown.edges
        .filter((e) => e.sourceId === selected.id || e.targetId === selected.id)
        .map((edge) => {
          const outgoing = edge.sourceId === selected.id;
          return {
            edge,
            otherId: outgoing ? edge.targetId : edge.sourceId,
            label: outgoing ? edge.label : edge.inverseLabel,
          };
        })
    : [];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-sm font-medium text-muted-foreground">Connections</p>
          <h1 className="font-serif text-3xl font-semibold">Relationship graph</h1>
          <p className="mt-1 text-muted-foreground">
            {focusNode
              ? `${focusNode.name} and what is linked to them, ${depth} ${depth === 1 ? 'link' : 'links'} out`
              : 'The most connected entries in the world'}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <EntityPicker
            onSelect={(entity) => setFocus(entity.id)}
            trigger={
              <Button variant="outline">
                <Focus /> {focusNode ? 'Focus on another' : 'Focus on an entry'}
              </Button>
            }
          />
          {focusNode ? (
            <>
              <NativeSelect
                aria-label="How many links out"
                className="w-auto"
                value={depth}
                onChange={(event) => {
                  const next = new URLSearchParams(params);
                  next.set('depth', event.target.value);
                  setParams(next);
                }}
              >
                {[1, 2, 3].map((d) => (
                  <option key={d} value={d}>
                    {d} {d === 1 ? 'link' : 'links'} out
                  </option>
                ))}
              </NativeSelect>
              <Button variant="ghost" onClick={() => setFocus(null)}>
                Whole world
              </Button>
            </>
          ) : null}
        </div>
      </div>

      {data.truncated ? (
        <p className="rounded-md border bg-muted/50 px-3 py-2 text-sm text-muted-foreground">
          More is connected than fits here, so this shows part of it.
          {focusNode
            ? ' Try fewer links out, or focus on a nearer entry.'
            : ' Focus on an entry to see its own web.'}
        </p>
      ) : null}

      {data.nodes.length === 0 ? (
        <EmptyState icon={<Network />} title="Nothing is linked yet">
          <p>
            Links between entries, such as “member of” or “ally of”, appear here as a web. Add some
            from an entry’s relationships panel.
          </p>
        </EmptyState>
      ) : (
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_18rem]">
          <div className="space-y-3">
            <div className="relative overflow-hidden rounded-xl border bg-card">
              <svg
                ref={setSvgEl}
                role="img"
                aria-label={`Relationship graph with ${shown.nodes.length} entries and ${shown.edges.length} links`}
                viewBox={`0 0 ${VB_W} ${VB_H}`}
                className="block h-[68vh] min-h-96 w-full cursor-grab touch-none select-none active:cursor-grabbing"
                {...pan.handlers}
                onClick={() => {
                  if (!pan.wasDrag()) setSelectedId(null);
                }}
              >
                <g transform={`translate(${pan.view.x} ${pan.view.y}) scale(${pan.view.k})`}>
                  {shown.edges.map((edge) => {
                    const a = placed.get(edge.sourceId);
                    const b = placed.get(edge.targetId);
                    if (!a || !b) return null;
                    const on =
                      spotlight === null ||
                      edge.sourceId === spotlight ||
                      edge.targetId === spotlight;
                    return (
                      <g key={edge.id} opacity={on ? 1 : 0.12}>
                        <line
                          x1={a.x}
                          y1={a.y}
                          x2={b.x}
                          y2={b.y}
                          stroke="currentColor"
                          strokeOpacity={0.35}
                          strokeWidth={1.4}
                          strokeDasharray={
                            edge.validFromDay !== null || edge.validToDay !== null
                              ? '5 4'
                              : undefined
                          }
                        />
                        {labels || (on && spotlight !== null) ? (
                          <text
                            x={(a.x + b.x) / 2}
                            y={(a.y + b.y) / 2 - 3}
                            textAnchor="middle"
                            className="fill-muted-foreground text-[17px]"
                          >
                            {edge.label}
                          </text>
                        ) : null}
                      </g>
                    );
                  })}
                  {shown.nodes.map((node) => {
                    const p = placed.get(node.id);
                    if (!p) return null;
                    const type = typeById.get(node.typeId);
                    const r = radiusOf(node);
                    const isFocus = node.id === data.focusId;
                    const isSelected = node.id === selectedId;
                    return (
                      <g
                        key={node.id}
                        transform={`translate(${p.x} ${p.y})`}
                        opacity={lit(node.id) ? 1 : 0.18}
                        className="cursor-pointer"
                        role="button"
                        tabIndex={0}
                        aria-label={`${node.name}, ${node.degree} ${node.degree === 1 ? 'link' : 'links'}`}
                        onPointerEnter={() => setHoverId(node.id)}
                        onPointerLeave={() => setHoverId(null)}
                        onClick={(event) => {
                          event.stopPropagation();
                          if (!pan.wasDrag()) setSelectedId(node.id);
                        }}
                        onDoubleClick={(event) => {
                          event.stopPropagation();
                          setFocus(node.id);
                        }}
                        onKeyDown={(event) => {
                          if (event.key === 'Enter' || event.key === ' ') {
                            event.preventDefault();
                            setSelectedId(node.id);
                          }
                        }}
                      >
                        {isFocus || isSelected ? (
                          <circle
                            r={r + 5}
                            fill="none"
                            stroke={type?.color ?? FALLBACK_COLOR}
                            strokeWidth={2}
                            strokeOpacity={0.5}
                          />
                        ) : null}
                        <circle
                          r={r}
                          fill={type?.color ?? FALLBACK_COLOR}
                          stroke="var(--card)"
                          strokeWidth={2}
                        />
                        <text
                          y={r + 22}
                          textAnchor="middle"
                          className={cn('fill-foreground text-[20px]', isFocus && 'font-semibold')}
                          paintOrder="stroke"
                          stroke="var(--card)"
                          strokeWidth={3}
                        >
                          {node.name.length > 24 ? `${node.name.slice(0, 23)}…` : node.name}
                        </text>
                      </g>
                    );
                  })}
                </g>
              </svg>
              <div className="absolute bottom-3 left-3 flex gap-1">
                <Button variant="outline" size="icon-sm" aria-label="Zoom in" onClick={pan.zoomIn}>
                  <ZoomIn />
                </Button>
                <Button
                  variant="outline"
                  size="icon-sm"
                  aria-label="Zoom out"
                  onClick={pan.zoomOut}
                >
                  <ZoomOut />
                </Button>
                <Button
                  variant="outline"
                  size="icon-sm"
                  aria-label="Reset the view"
                  onClick={pan.reset}
                >
                  <Maximize2 />
                </Button>
              </div>
              <p className="pointer-events-none absolute bottom-3 right-3 hidden rounded bg-card/80 px-2 py-1 text-xs text-muted-foreground sm:block">
                Drag to pan, scroll to zoom. Click an entry for details, double-click to centre on
                it.
              </p>
            </div>

            <div className="space-y-2">
              <div className="flex flex-wrap items-center gap-1.5" aria-label="Entry types">
                {typesPresent.map(([typeId, count]) => {
                  const type = typeById.get(typeId);
                  const off = hiddenTypes.has(typeId);
                  return (
                    <button
                      key={typeId}
                      type="button"
                      aria-pressed={!off}
                      onClick={() => setHiddenTypes((s) => toggle(s, typeId))}
                      className={cn(
                        'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs transition-colors',
                        off
                          ? 'text-muted-foreground line-through opacity-60'
                          : 'bg-card hover:bg-muted',
                      )}
                    >
                      <span
                        className="size-2.5 rounded-full"
                        style={{ backgroundColor: type?.color ?? FALLBACK_COLOR }}
                      />
                      {type?.name ?? 'Other'}{' '}
                      <span className="tabular-nums opacity-60">{count}</span>
                    </button>
                  );
                })}
              </div>
              <div className="flex flex-wrap items-center gap-1.5" aria-label="Link types">
                {linkTypesPresent.map(([typeId, count]) => {
                  const off = hiddenLinks.has(typeId);
                  const label = relTypes?.find((t) => t.id === typeId)?.label ?? 'link';
                  return (
                    <button
                      key={typeId}
                      type="button"
                      aria-pressed={!off}
                      onClick={() => setHiddenLinks((s) => toggle(s, typeId))}
                      className={cn(
                        'inline-flex items-center gap-1.5 rounded-md border px-2 py-0.5 text-xs transition-colors',
                        off
                          ? 'text-muted-foreground line-through opacity-60'
                          : 'bg-card hover:bg-muted',
                      )}
                    >
                      {label} <span className="tabular-nums opacity-60">{count}</span>
                    </button>
                  );
                })}
                <label className="ml-auto flex items-center gap-2 text-xs text-muted-foreground">
                  <input
                    type="checkbox"
                    checked={labels}
                    onChange={(event) => setLabels(event.target.checked)}
                    className="size-4 accent-primary"
                  />
                  <TagIcon className="size-3.5" /> Label every link
                </label>
              </div>
            </div>
          </div>

          <aside aria-label="Selected entry" className="space-y-3">
            {selected ? (
              <div className="space-y-3 rounded-xl border bg-card p-3">
                <div className="flex items-start gap-2">
                  <EntityIcon
                    icon={typeById.get(selected.typeId)?.icon ?? 'file-text'}
                    color={typeById.get(selected.typeId)?.color}
                    className="mt-1"
                  />
                  <div className="min-w-0">
                    <Link
                      to={`${base}/e/${selected.id}`}
                      className="font-serif text-lg font-semibold hover:underline"
                    >
                      {selected.name}
                    </Link>
                    <p className="text-xs text-muted-foreground">
                      {typeById.get(selected.typeId)?.name}
                    </p>
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  {selected.id !== data.focusId ? (
                    <Button size="sm" onClick={() => setFocus(selected.id)}>
                      <Focus /> Centre here
                    </Button>
                  ) : null}
                  <Button asChild variant="outline" size="sm">
                    <Link to={`${base}/family/${selected.id}`}>
                      <GitFork /> Family tree
                    </Link>
                  </Button>
                </div>
                <ul className="space-y-1 text-sm">
                  {selectedLinks.map(({ edge, otherId, label }) => (
                    <li key={edge.id}>
                      <button
                        type="button"
                        className="w-full rounded-md px-2 py-1 text-left hover:bg-muted"
                        onClick={() => setSelectedId(otherId)}
                      >
                        <span className="text-muted-foreground">{label}</span>{' '}
                        {byId.get(otherId)?.name}
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            ) : (
              <p className="rounded-xl border border-dashed p-4 text-sm text-muted-foreground">
                Click an entry in the graph to see what it is linked to.
                {audience !== 'gm' ? ' You only see what the GM has shared.' : ''}
              </p>
            )}
            <p className="text-xs text-muted-foreground">
              {shown.nodes.length} {shown.nodes.length === 1 ? 'entry' : 'entries'},{' '}
              {shown.edges.length} {shown.edges.length === 1 ? 'link' : 'links'}. A dashed line is a
              link that holds only for a time.
            </p>
          </aside>
        </div>
      )}
    </div>
  );
}

export { GraphPage as Component };
