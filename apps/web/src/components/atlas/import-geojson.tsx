import { FileUp } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import type { AtlasMap } from '@atlas/shared';
import { useImportGeoJson } from '@/api/atlas-queries';
import { errorMessage } from '@/api/client';
import { Button } from '@/components/ui/button';
import { Input, Label } from '@/components/ui/inputs';
import { useWorld } from '@/lib/world-context';

/** Bring places, roads and areas from a map generator's GeoJSON export onto this map. */
export function ImportGeoJson({ map }: { map: AtlasMap }) {
  const { world } = useWorld();
  const importer = useImportGeoJson(world.id, map.id);
  const [file, setFile] = useState<File | null>(null);
  const [flipY, setFlipY] = useState(true);

  async function run() {
    if (!file) return;
    let geojson: unknown;
    try {
      geojson = JSON.parse(await file.text());
    } catch {
      toast.error('That file is not valid JSON.');
      return;
    }
    try {
      const result = await importer.mutateAsync({ geojson, flipY });
      toast.success(
        `Brought in ${result.created} ${result.created === 1 ? 'item' : 'items'}` +
          (result.skipped > 0 ? ` (${result.skipped} could not be used)` : '') +
          '. They are hidden from players until you reveal them.',
      );
      setFile(null);
    } catch (error) {
      toast.error(errorMessage(error));
    }
  }

  return (
    <section className="mb-4 space-y-2 rounded-lg border p-3">
      <Label htmlFor="settings-geojson">Import places from GeoJSON</Label>
      <p className="text-xs text-muted-foreground">
        From Azgaar’s Fantasy Map Generator, Watabou’s generators or any GeoJSON file: points become
        pins, lines become paths and areas become regions, scaled to fit this map. Up to 500 items.
      </p>
      <div className="flex items-center gap-2">
        <Input
          id="settings-geojson"
          type="file"
          accept=".json,.geojson,application/json,application/geo+json"
          onChange={(event) => setFile(event.target.files?.[0] ?? null)}
        />
        <Button
          type="button"
          variant="outline"
          disabled={!file || importer.isPending}
          onClick={() => void run()}
        >
          <FileUp /> {importer.isPending ? 'Importing…' : 'Import'}
        </Button>
      </div>
      <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <input type="checkbox" checked={flipY} onChange={(e) => setFlipY(e.target.checked)} />
        North is up (leave on for latitude and longitude; turn off for pixel coordinates)
      </label>
    </section>
  );
}
