import { Eye, EyeOff, Layers, Plus, Trash2 } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { toast } from 'sonner';
import type { MapLayer } from '@atlas/shared';
import { useCreateLayer, useDeleteLayer, useUpdateLayer } from '@/api/atlas-queries';
import { errorMessage } from '@/api/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/inputs';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { useWorld } from '@/lib/world-context';

/**
 * The "Layers" button in the map's header. Everyone can switch layers on and off for their own
 * view; the GM can also add, rename and remove them and choose which start switched on.
 */
export function LayersMenu({
  mapId,
  layers,
  hidden,
  canEdit,
  onToggle,
}: {
  mapId: string;
  layers: MapLayer[];
  hidden: Set<string>;
  canEdit: boolean;
  onToggle: (layerId: string) => void;
}) {
  const { world } = useWorld();
  const create = useCreateLayer(world.id, mapId);
  const update = useUpdateLayer(world.id, mapId);
  const remove = useDeleteLayer(world.id, mapId);
  const [name, setName] = useState('');

  if (layers.length === 0 && !canEdit) return null;

  async function add(event: FormEvent) {
    event.preventDefault();
    const next = name.trim();
    if (!next) return;
    try {
      await create.mutateAsync({ name: next });
      setName('');
    } catch (error) {
      toast.error(errorMessage(error));
    }
  }

  const shown = layers.filter((layer) => !hidden.has(layer.id)).length;
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="sm" title="Layers" aria-label="Layers">
          <Layers />
          <span className="hidden sm:inline">Layers</span>
          {layers.length > 0 ? (
            <span className="text-xs text-muted-foreground">
              {shown}/{layers.length}
            </span>
          ) : null}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 p-3">
        <h2 className="mb-2 text-sm font-semibold">Layers</h2>
        {layers.length === 0 ? (
          <p className="mb-3 text-sm text-muted-foreground">
            Group pins, roads and borders into layers (political, trade routes, a war…) so they can
            be switched on and off. Add a layer here, then pick it for an item in its panel.
          </p>
        ) : (
          <ul className="mb-3 space-y-1">
            {layers.map((layer) => {
              const off = hidden.has(layer.id);
              return (
                <li key={layer.id} className="flex items-center gap-1">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="min-w-0 flex-1 justify-start"
                    aria-pressed={!off}
                    onClick={() => onToggle(layer.id)}
                  >
                    {off ? <EyeOff className="text-muted-foreground" /> : <Eye />}
                    <span className={off ? 'truncate text-muted-foreground' : 'truncate'}>
                      {layer.name}
                    </span>
                  </Button>
                  {canEdit ? (
                    <>
                      <label className="flex shrink-0 items-center gap-1 text-xs text-muted-foreground">
                        <input
                          type="checkbox"
                          checked={layer.visibleByDefault}
                          onChange={(event) =>
                            update.mutate(
                              { id: layer.id, visibleByDefault: event.target.checked },
                              { onError: (error) => toast.error(errorMessage(error)) },
                            )
                          }
                        />
                        On at start
                      </label>
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        onClick={() =>
                          remove.mutate(layer.id, {
                            onError: (error) => toast.error(errorMessage(error)),
                          })
                        }
                      >
                        <Trash2 />
                        <span className="sr-only">Delete layer {layer.name}</span>
                      </Button>
                    </>
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}
        {canEdit ? (
          <form onSubmit={add} className="flex gap-2">
            <Input
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="New layer"
              aria-label="New layer name"
              maxLength={60}
            />
            <Button type="submit" size="sm" disabled={!name.trim() || create.isPending}>
              <Plus /> Add
            </Button>
          </form>
        ) : null}
        {canEdit && layers.length > 0 ? (
          <p className="mt-2 text-xs text-muted-foreground">
            Deleting a layer keeps its items; they go back to the base map.
          </p>
        ) : null}
      </PopoverContent>
    </Popover>
  );
}
