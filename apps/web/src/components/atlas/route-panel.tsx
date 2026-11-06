import { Waypoints } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import {
  findRoute,
  formatDistance,
  formatTravel,
  travelDays,
  type AtlasMap,
  type MapFeature,
  type MapPoint,
} from '@atlas/shared';
import { NativeSelect } from '@/components/ui/inputs';
import { Label } from '@/components/ui/inputs';

const pinName = (pin: MapFeature) => pin.label || pin.entity?.name || 'Unnamed pin';

/**
 * The side panel for finding a route: pick two pins and it walks the roads (paths) between
 * them, drawing the way on the map and, if the map has a scale, saying how far and how long.
 */
export function RoutePanel({
  map,
  features,
  onRoute,
}: {
  map: AtlasMap;
  features: MapFeature[];
  /** The line to show on the map; empty clears it. */
  onRoute: (points: MapPoint[]) => void;
}) {
  const pins = useMemo(
    () =>
      features.filter((f) => f.kind === 'pin').sort((a, b) => pinName(a).localeCompare(pinName(b))),
    [features],
  );
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');

  const route = useMemo(() => {
    if (!from || !to || from === to) return null;
    return findRoute(
      pins.map((p) => ({ id: p.id, point: p.points[0]! })),
      features
        .filter((f) => f.kind === 'path' || f.kind === 'journey')
        .map((f) => ({ id: f.id, points: f.points })),
      from,
      to,
      { width: map.width, height: map.height },
    );
  }, [pins, features, from, to, map.width, map.height]);

  useEffect(() => {
    onRoute(route?.points ?? []);
  }, [route, onRoute]);
  // Clear the highlight when the panel closes.
  useEffect(() => () => onRoute([]), [onRoute]);

  const pathNames = route
    ? route.pathIds.map((id) => {
        const path = features.find((f) => f.id === id);
        return path?.label || path?.entity?.name || 'an unnamed road';
      })
    : [];
  // The scale is "units across the whole width", so a length in map pixels converts directly.
  const distance = route && map.scale ? (route.length / map.width) * map.scale.width : null;

  return (
    <div className="space-y-5 p-4">
      <div className="flex items-start gap-2">
        <span className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-md border bg-card text-muted-foreground">
          <Waypoints className="size-4" />
        </span>
        <div>
          <h2 className="font-serif text-lg font-semibold">Find a route</h2>
          <p className="text-xs text-muted-foreground">
            Follows paths between pins. A path joins a pin when it starts or ends on it, and two
            paths join where they share a point.
          </p>
        </div>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="route-from">From</Label>
        <NativeSelect id="route-from" value={from} onChange={(e) => setFrom(e.target.value)}>
          <option value="">Choose a place…</option>
          {pins.map((p) => (
            <option key={p.id} value={p.id}>
              {pinName(p)}
            </option>
          ))}
        </NativeSelect>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="route-to">To</Label>
        <NativeSelect id="route-to" value={to} onChange={(e) => setTo(e.target.value)}>
          <option value="">Choose a place…</option>
          {pins.map((p) => (
            <option key={p.id} value={p.id}>
              {pinName(p)}
            </option>
          ))}
        </NativeSelect>
      </div>

      {pins.length < 2 ? (
        <p className="text-sm text-muted-foreground">Drop at least two pins to find a route.</p>
      ) : !from || !to || from === to ? null : !route ? (
        <p role="status" className="text-sm text-destructive">
          No road joins those two places. Check that the paths start and end on the pins.
        </p>
      ) : (
        <section aria-label="Route" className="rounded-lg border bg-card p-3">
          <p className="text-2xl font-semibold">
            {map.scale && distance !== null ? formatDistance(distance, map.scale.unit) : 'Found'}
          </p>
          <p className="text-xs text-muted-foreground">
            {pathNames.length === 0
              ? 'These are the same place.'
              : `Along ${pathNames.join(', then ')}.`}
          </p>
          {map.scale && distance !== null && map.scale.modes.length > 0 ? (
            <ul className="mt-3 space-y-1 border-t pt-2 text-sm">
              {map.scale.modes.map((mode) => (
                <li key={mode.name} className="flex justify-between gap-3">
                  <span>{mode.name}</span>
                  <span className="text-muted-foreground">
                    {formatTravel(travelDays(distance, mode.perDay))}
                  </span>
                </li>
              ))}
            </ul>
          ) : null}
          {!map.scale ? (
            <p className="mt-2 text-xs text-muted-foreground">
              Set the map’s scale in its settings to see distance and travel time.
            </p>
          ) : null}
        </section>
      )}
    </div>
  );
}
