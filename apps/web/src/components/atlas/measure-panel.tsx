import { Ruler, Route, Trash2, Undo2 } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { toast } from 'sonner';
import {
  defaultTravelModes,
  formatDistance,
  formatTravel,
  pathLength,
  scaleWidthFromReference,
  travelDays,
  type AtlasMap,
  type MapPoint,
} from '@atlas/shared';
import { useUpdateMap } from '@/api/atlas-queries';
import { errorMessage } from '@/api/client';
import { Button } from '@/components/ui/button';
import { Input, Label } from '@/components/ui/inputs';
import { useWorld } from '@/lib/world-context';

/**
 * The side panel while measuring: the distance of the line drawn so far, how long each way of
 * travelling takes, and (for the GM) a way to set the map's scale from a line of known length.
 */
export function MeasurePanel({
  map,
  points,
  canEdit,
  onUndo,
  onClear,
  onSaveAsPath,
}: {
  map: AtlasMap;
  points: MapPoint[];
  canEdit: boolean;
  onUndo: () => void;
  onClear: () => void;
  onSaveAsPath: () => void;
}) {
  const { world } = useWorld();
  const updateMap = useUpdateMap(world.id);
  const [known, setKnown] = useState('');
  const [unit, setUnit] = useState(map.scale?.unit ?? 'mi');
  const length = map.scale ? pathLength(points, map, map.scale) : null;
  const hasLine = points.length >= 2;

  async function calibrate(event: FormEvent) {
    event.preventDefault();
    const distance = Number(known);
    const width = scaleWidthFromReference(points, map, distance);
    if (width === null) {
      toast.error('Draw a line between two places first, and give the distance between them.');
      return;
    }
    const cleanUnit = unit.trim() || 'mi';
    try {
      await updateMap.mutateAsync({
        id: map.id,
        scale: {
          width: Math.round(width * 100) / 100,
          unit: cleanUnit,
          // Keep the paces someone already chose; start from typical ones otherwise.
          modes: map.scale?.modes ?? defaultTravelModes(cleanUnit),
        },
      });
      setKnown('');
      toast.success(`The map is now ${Math.round(width).toLocaleString()} ${cleanUnit} wide`);
    } catch (error) {
      toast.error(errorMessage(error));
    }
  }

  return (
    <div className="space-y-5 p-4">
      <div className="flex items-start gap-2">
        <span className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-md border bg-card text-muted-foreground">
          <Ruler className="size-4" />
        </span>
        <div>
          <h2 className="font-serif text-lg font-semibold">Measure</h2>
          <p className="text-xs text-muted-foreground">
            Click along a route. Backspace removes the last point.
          </p>
        </div>
      </div>

      {map.scale ? (
        <section aria-label="Distance" className="rounded-lg border bg-card p-3">
          <p className="text-2xl font-semibold">
            {hasLine && length !== null ? formatDistance(length, map.scale.unit) : '—'}
          </p>
          <p className="text-xs text-muted-foreground">
            {hasLine ? `${points.length} points` : 'Click two or more points to measure a route.'}
          </p>
          {hasLine && length !== null && map.scale.modes.length > 0 ? (
            <ul className="mt-3 space-y-1 border-t pt-2 text-sm">
              {map.scale.modes.map((mode) => (
                <li key={mode.name} className="flex justify-between gap-3">
                  <span>{mode.name}</span>
                  <span className="text-muted-foreground">
                    {formatTravel(travelDays(length, mode.perDay))}
                  </span>
                </li>
              ))}
            </ul>
          ) : null}
          {map.scale.modes.length === 0 ? (
            <p className="mt-2 text-xs text-muted-foreground">
              {canEdit
                ? 'Add travel paces in the map settings to see how long a trip takes.'
                : null}
            </p>
          ) : null}
        </section>
      ) : (
        <p className="rounded-lg border border-dashed bg-card p-3 text-sm text-muted-foreground">
          {canEdit
            ? 'This map has no scale yet. Draw a line between two places whose distance you know, then enter that distance below.'
            : 'This map has no scale, so distances are not available.'}
        </p>
      )}

      <div className="flex flex-wrap gap-2">
        <Button variant="outline" size="sm" onClick={onUndo} disabled={points.length === 0}>
          <Undo2 /> Undo point
        </Button>
        <Button variant="outline" size="sm" onClick={onClear} disabled={points.length === 0}>
          <Trash2 /> Clear
        </Button>
        {canEdit ? (
          <Button size="sm" onClick={onSaveAsPath} disabled={!hasLine}>
            <Route /> Save as path
          </Button>
        ) : null}
      </div>

      {canEdit ? (
        <form onSubmit={calibrate} className="space-y-2 border-t pt-4">
          <h3 className="text-sm font-semibold">
            {map.scale ? 'Recalibrate from this line' : 'Set the scale from this line'}
          </h3>
          <div className="flex items-end gap-2">
            <div className="min-w-0 flex-1 space-y-1">
              <Label htmlFor="known-distance">The line is</Label>
              <Input
                id="known-distance"
                inputMode="decimal"
                value={known}
                onChange={(event) => setKnown(event.target.value)}
                placeholder="e.g. 120"
              />
            </div>
            <div className="w-24 space-y-1">
              <Label htmlFor="known-unit">Unit</Label>
              <Input
                id="known-unit"
                value={unit}
                maxLength={12}
                onChange={(event) => setUnit(event.target.value)}
              />
            </div>
          </div>
          <Button type="submit" size="sm" disabled={!hasLine || !known || updateMap.isPending}>
            Set scale
          </Button>
        </form>
      ) : null}
    </div>
  );
}
