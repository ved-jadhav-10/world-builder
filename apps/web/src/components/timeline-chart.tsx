import { useEffect, useId, useMemo, useRef, useState, type PointerEvent } from 'react';
import { formatDate } from '@atlas/shared';
import { buildTicks, fitView, MIN_ITEM_WIDTH, packRows } from '@/lib/timeline-layout';
import { useWorld } from '@/lib/world-context';

export interface TimelineItem {
  key: string;
  laneKey: string;
  name: string;
  /** First and last day. They match for a single moment. */
  from: number;
  to: number;
  /** An entry with only an end date, such as a death with no known birth. */
  endOnly: boolean;
  color: string;
}

export interface TimelineLane {
  key: string;
  name: string;
  color: string;
}

const LABEL_W = 128;
const AXIS_H = 34;
const ROW_H = 26;
const LANE_PAD = 8;
const MIN_PX_PER_DAY = 1e-6;
const MAX_PX_PER_DAY = 400;

interface View {
  /** The day at the left edge of the chart area. */
  startDay: number;
  pxPerDay: number;
}

/** Estimated width of a label, since SVG text can't be measured without drawing it. */
const labelWidth = (text: string) => text.length * 6.4 + 16;

const clampZoom = (pxPerDay: number) =>
  Math.min(MAX_PX_PER_DAY, Math.max(MIN_PX_PER_DAY, pxPerDay));

/**
 * Swimlanes of dated things over time. Drag to pan, Ctrl+scroll (or the buttons) to zoom, and click
 * the date ruler to drop a marker. Everything is drawn from day numbers and the world's calendar.
 */
export function TimelineChart({
  items,
  lanes,
  selectedKey,
  onSelect,
  marker,
  onMarker,
  fitRequest,
  zoomRequest,
}: {
  items: TimelineItem[];
  lanes: TimelineLane[];
  selectedKey: string | null;
  onSelect: (key: string | null) => void;
  marker: number | null;
  onMarker: (day: number | null) => void;
  /** Bump to frame everything. */
  fitRequest: number;
  /** A zoom to apply at the centre: the factor and a counter so repeats register. */
  zoomRequest: { factor: number; n: number };
}) {
  const { calendar } = useWorld();
  const clipId = useId();
  const hostRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  const [userView, setUserView] = useState<View | null>(null);
  const [handledFit, setHandledFit] = useState(fitRequest);
  const [handledZoom, setHandledZoom] = useState(zoomRequest.n);
  const drag = useRef<{ x: number; startDay: number; moved: boolean } | null>(null);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const observer = new ResizeObserver(([entry]) => setWidth(entry!.contentRect.width));
    observer.observe(host);
    return () => observer.disconnect();
  }, []);

  const chartW = Math.max(0, width - LABEL_W);
  const bounds = useMemo(() => {
    if (items.length === 0) return { first: 0, last: 1 };
    return {
      first: Math.min(...items.map((i) => i.from)),
      last: Math.max(...items.map((i) => i.to)),
    };
  }, [items]);
  const fitted = useMemo(
    () => fitView(bounds.first, bounds.last, Math.max(chartW, 1)),
    [bounds, chartW],
  );

  // The Fit button hands control back to the automatic framing.
  if (fitRequest !== handledFit) {
    setHandledFit(fitRequest);
    setUserView(null);
  }
  const view = userView ?? fitted;

  const zoomAt = (factor: number, anchorX: number, from: View = view) => {
    const pxPerDay = clampZoom(from.pxPerDay * factor);
    const anchorDay = from.startDay + (anchorX - LABEL_W) / from.pxPerDay;
    setUserView({ pxPerDay, startDay: anchorDay - (anchorX - LABEL_W) / pxPerDay });
  };
  if (zoomRequest.n !== handledZoom) {
    setHandledZoom(zoomRequest.n);
    zoomAt(zoomRequest.factor, LABEL_W + chartW / 2);
  }

  // Ctrl+scroll (and trackpad pinch) zooms; sideways scrolling pans. Plain scroll still scrolls the page.
  const latest = useRef({ view, zoomAt });
  useEffect(() => {
    latest.current = { view, zoomAt };
  });
  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const onWheel = (event: WheelEvent) => {
      const { view: current, zoomAt: zoom } = latest.current;
      if (event.ctrlKey || event.metaKey) {
        event.preventDefault();
        const x = event.clientX - host.getBoundingClientRect().left;
        zoom(Math.exp(-event.deltaY * 0.0025), x, current);
      } else if (Math.abs(event.deltaX) > Math.abs(event.deltaY)) {
        event.preventDefault();
        setUserView({ ...current, startDay: current.startDay + event.deltaX / current.pxPerDay });
      }
    };
    host.addEventListener('wheel', onWheel, { passive: false });
    return () => host.removeEventListener('wheel', onWheel);
  }, []);

  const dayAt = (x: number) => view.startDay + (x - LABEL_W) / view.pxPerDay;
  const xOf = (day: number) => LABEL_W + (day - view.startDay) * view.pxPerDay;

  // Stack each lane's items into rows for this zoom level.
  const layout = useMemo(() => {
    const packed = lanes.map((lane) => {
      const laneItems = items.filter((i) => i.laneKey === lane.key);
      const { rowOf, rowCount } = packRows(
        laneItems.map((i) => ({
          id: i.key,
          from: i.from,
          to: i.to,
          labelWidth: labelWidth(i.name),
        })),
        view.pxPerDay,
      );
      const height = Math.max(1, rowCount) * ROW_H + LANE_PAD * 2;
      return { lane, items: laneItems, rowOf, height };
    });
    // Each lane starts where the one above it ends.
    return packed.map((entry, index) => ({
      ...entry,
      top: AXIS_H + packed.slice(0, index).reduce((sum, earlier) => sum + earlier.height, 0),
    }));
  }, [lanes, items, view.pxPerDay]);
  const totalH = layout.length
    ? layout[layout.length - 1]!.top + layout[layout.length - 1]!.height
    : AXIS_H;

  const lastDay = view.startDay + chartW / view.pxPerDay;
  const ticks = useMemo(
    () => buildTicks(calendar, view.startDay, lastDay, view.pxPerDay),
    [calendar, view.startDay, lastDay, view.pxPerDay],
  );

  function onPointerDown(event: PointerEvent<SVGSVGElement>) {
    if (event.button !== 0) return;
    drag.current = { x: event.clientX, startDay: view.startDay, moved: false };
    event.currentTarget.setPointerCapture(event.pointerId);
  }
  function onPointerMove(event: PointerEvent<SVGSVGElement>) {
    const d = drag.current;
    if (!d) return;
    const dx = event.clientX - d.x;
    if (Math.abs(dx) > 3) d.moved = true;
    if (d.moved)
      setUserView({ pxPerDay: view.pxPerDay, startDay: d.startDay - dx / view.pxPerDay });
  }
  function onPointerUp(event: PointerEvent<SVGSVGElement>) {
    const d = drag.current;
    drag.current = null;
    if (d && !d.moved) {
      const box = event.currentTarget.getBoundingClientRect();
      const x = event.clientX - box.left;
      const y = event.clientY - box.top;
      if (x >= LABEL_W && y < AXIS_H) onMarker(Math.round(dayAt(x)));
      else onSelect(null);
    }
  }

  return (
    <div ref={hostRef} className="select-none overflow-hidden rounded-xl border bg-card">
      {width > 0 ? (
        <svg
          width={width}
          height={totalH}
          role="group"
          aria-label="Timeline"
          className="block cursor-grab touch-pan-y active:cursor-grabbing"
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onKeyDown={(event) => {
            if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
              const step = ((event.key === 'ArrowLeft' ? -1 : 1) * (chartW / 6)) / view.pxPerDay;
              setUserView({ ...view, startDay: view.startDay + step });
            } else if (event.key === '+' || event.key === '=') {
              zoomAt(1.4, LABEL_W + chartW / 2);
            } else if (event.key === '-') {
              zoomAt(1 / 1.4, LABEL_W + chartW / 2);
            }
          }}
          tabIndex={0}
        >
          <defs>
            <clipPath id={clipId}>
              <rect x={LABEL_W} y={0} width={chartW} height={totalH} />
            </clipPath>
          </defs>

          {/* Lane backgrounds and labels */}
          {layout.map(({ lane, top, height }, index) => (
            <g key={lane.key}>
              <rect
                x={0}
                y={top}
                width={width}
                height={height}
                className={index % 2 ? 'fill-muted/40' : 'fill-transparent'}
              />
              <rect x={0} y={top} width={4} height={height} fill={lane.color} />
            </g>
          ))}

          <g clipPath={`url(#${clipId})`}>
            {/* Date ruler */}
            <rect x={LABEL_W} y={0} width={chartW} height={AXIS_H} className="fill-muted/60" />
            {ticks.map((tick, i) => {
              const x = xOf(tick.day);
              return (
                <g key={`${tick.day}-${i}`}>
                  <line
                    x1={x}
                    x2={x}
                    y1={tick.major ? 0 : AXIS_H - 8}
                    y2={totalH}
                    className={tick.major ? 'stroke-border' : 'stroke-border/50'}
                    strokeWidth={1}
                  />
                  <text
                    x={x + 4}
                    y={tick.major ? 15 : 28}
                    className={
                      tick.major
                        ? 'fill-foreground text-[11px] font-medium'
                        : 'fill-muted-foreground text-[10px]'
                    }
                  >
                    {tick.label}
                  </text>
                </g>
              );
            })}

            {/* Items */}
            {layout.map(({ items: laneItems, rowOf, top }) =>
              laneItems.map((item) => {
                const x0 = xOf(item.from);
                const x1 = Math.max(xOf(item.to), x0 + MIN_ITEM_WIDTH);
                const textW = labelWidth(item.name);
                if (x1 + textW < LABEL_W || x0 > width) return null;
                const y = top + LANE_PAD + (rowOf.get(item.key) ?? 0) * ROW_H;
                const isSpan = item.to > item.from;
                const selected = item.key === selectedKey;
                const inside = isSpan && x1 - x0 >= textW;
                const title = `${item.name}: ${
                  isSpan
                    ? `${formatDate(calendar, item.from)} to ${formatDate(calendar, item.to)}`
                    : formatDate(calendar, item.from)
                }`;
                return (
                  <g
                    key={item.key}
                    role="button"
                    tabIndex={0}
                    aria-label={title}
                    aria-pressed={selected}
                    className="cursor-pointer outline-none [&:focus-visible_.hit]:stroke-ring"
                    onPointerDown={(event) => event.stopPropagation()}
                    onClick={() => onSelect(item.key)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter' || event.key === ' ') {
                        event.preventDefault();
                        onSelect(item.key);
                      }
                    }}
                  >
                    <title>{title}</title>
                    <rect
                      className="hit fill-transparent"
                      x={x0 - 4}
                      y={y}
                      width={Math.max(x1 - x0, inside ? 0 : textW) + (inside ? 8 : 12)}
                      height={ROW_H - 2}
                      strokeWidth={2}
                      rx={4}
                    />
                    {isSpan ? (
                      <rect
                        x={x0}
                        y={y + 4}
                        width={x1 - x0}
                        height={ROW_H - 10}
                        rx={4}
                        fill={item.color}
                        opacity={selected ? 1 : 0.82}
                        stroke={selected ? 'currentColor' : 'none'}
                        strokeWidth={2}
                      />
                    ) : item.endOnly ? (
                      <rect
                        x={x0 - 4.5}
                        y={y + ROW_H / 2 - 5.5}
                        width={9}
                        height={9}
                        transform={`rotate(45 ${x0} ${y + ROW_H / 2 - 1})`}
                        className="fill-card"
                        stroke={item.color}
                        strokeWidth={selected ? 3 : 2}
                      />
                    ) : (
                      <circle
                        cx={x0}
                        cy={y + ROW_H / 2 - 1}
                        r={selected ? 7 : 5.5}
                        fill={item.color}
                        stroke={selected ? 'currentColor' : 'none'}
                        strokeWidth={2}
                      />
                    )}
                    <text
                      x={inside ? x0 + 6 : isSpan ? x1 + 6 : x0 + 11}
                      y={y + ROW_H / 2 + 3}
                      className={
                        inside
                          ? 'fill-white text-[11px] font-medium'
                          : 'fill-foreground text-[11px]'
                      }
                    >
                      {item.name}
                    </text>
                  </g>
                );
              }),
            )}

            {/* The "as of" marker */}
            {marker !== null ? (
              <g pointerEvents="none">
                <line
                  x1={xOf(marker)}
                  x2={xOf(marker)}
                  y1={0}
                  y2={totalH}
                  className="stroke-primary"
                  strokeWidth={2}
                  strokeDasharray="5 4"
                />
                <rect
                  x={xOf(marker) - 2}
                  y={0}
                  width={4}
                  height={AXIS_H}
                  className="fill-primary"
                />
              </g>
            ) : null}
          </g>

          {/* Lane labels sit on top so panning items slide underneath */}
          {layout.map(({ lane, top, height }) => (
            <g key={`label-${lane.key}`} pointerEvents="none">
              <rect x={4} y={top} width={LABEL_W - 4} height={height} className="fill-card" />
              <text
                x={12}
                y={top + height / 2 + 4}
                className="fill-foreground text-[12px] font-medium"
              >
                {lane.name.length > 16 ? `${lane.name.slice(0, 15)}…` : lane.name}
              </text>
            </g>
          ))}
          <rect
            x={0}
            y={0}
            width={LABEL_W}
            height={AXIS_H}
            className="fill-card"
            pointerEvents="none"
          />
          <text x={12} y={21} className="fill-muted-foreground text-[11px]" pointerEvents="none">
            Click ruler to mark
          </text>
        </svg>
      ) : (
        <div style={{ height: 160 }} />
      )}
    </div>
  );
}
