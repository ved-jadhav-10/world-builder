import { Download } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import {
  DEFAULT_PIXELS_PER_GRID,
  MAX_PIXELS_PER_GRID,
  MIN_PIXELS_PER_GRID,
  type AtlasMap,
} from '@atlas/shared';
import { downloadMapVtt } from '@/api/queries';
import { errorMessage } from '@/api/client';
import { Button } from '@/components/ui/button';
import { Input, Label } from '@/components/ui/inputs';
import { useWorld } from '@/lib/world-context';

/** Download the map as a Universal VTT file (.dd2vtt) for Foundry and other tabletop apps. */
export function ExportVtt({ map }: { map: AtlasMap }) {
  const { world } = useWorld();
  const [grid, setGrid] = useState(String(DEFAULT_PIXELS_PER_GRID));
  const [busy, setBusy] = useState(false);
  const size = Number(grid);
  const valid =
    Number.isInteger(size) && size >= MIN_PIXELS_PER_GRID && size <= MAX_PIXELS_PER_GRID;

  async function run() {
    setBusy(true);
    try {
      await downloadMapVtt(world, map, size);
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="mb-4 space-y-2 rounded-lg border p-3">
      <Label htmlFor="settings-vtt-grid">Export for tabletop apps</Label>
      <p className="text-xs text-muted-foreground">
        A Universal VTT file (.dd2vtt) with the picture and a grid, for Foundry and others that read
        it. Paths and regions on a layer named “Walls” block sight, and pins on a layer named
        “Lights” become lights. Pictures over 8,192 px are scaled down.
      </p>
      <div className="flex items-center gap-2">
        <Input
          id="settings-vtt-grid"
          type="number"
          min={MIN_PIXELS_PER_GRID}
          max={MAX_PIXELS_PER_GRID}
          className="w-24"
          value={grid}
          aria-label="Pixels per grid square"
          onChange={(event) => setGrid(event.target.value)}
        />
        <span className="text-xs text-muted-foreground">px per grid square</span>
        <Button
          type="button"
          variant="outline"
          className="ml-auto"
          disabled={!valid || busy || map.status !== 'ready'}
          onClick={() => void run()}
        >
          <Download /> {busy ? 'Preparing…' : 'Download'}
        </Button>
      </div>
    </section>
  );
}
