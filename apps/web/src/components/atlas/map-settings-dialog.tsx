import { Link2, Plus, Trash2, Upload, X } from 'lucide-react';
import { useState, type FormEvent, type ReactNode } from 'react';
import { useNavigate } from 'react-router';
import { toast } from 'sonner';
import {
  defaultTravelModes,
  type AtlasMap,
  type MapUpdateInput,
  type Visibility,
} from '@atlas/shared';
import { useDeleteMap, useReplaceMapImage, useUpdateMap } from '@/api/atlas-queries';
import { errorMessage } from '@/api/client';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { EntityIcon } from '@/components/entity-icon';
import { ImportGeoJson } from '@/components/atlas/import-geojson';
import { EntityPicker } from '@/components/entity-picker';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogFooter, DialogTrigger } from '@/components/ui/dialog';
import { Input, Label, NativeSelect, Textarea } from '@/components/ui/inputs';
import { descendantIds } from '@/lib/atlas-tree';
import { VisibilitySelect } from '@/lib/visibility';
import { useWorld } from '@/lib/world-context';

interface ModeRow {
  name: string;
  perDay: string;
}

const modeRows = (map: AtlasMap): ModeRow[] =>
  (map.scale?.modes ?? []).map((m) => ({ name: m.name, perDay: String(m.perDay) }));

/** Rename a map, move it under another one, link it to an entry, or delete it. */
export function MapSettingsDialog({
  map,
  maps,
  trigger,
}: {
  map: AtlasMap;
  maps: AtlasMap[];
  trigger: ReactNode;
}) {
  const { world, typeById, base } = useWorld();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  // undefined = leave as is; null = cleared.
  const [entity, setEntity] = useState<
    { id: string; name: string; typeId: string } | null | undefined
  >(undefined);
  const [visibility, setVisibility] = useState<Visibility>(map.visibility);
  const [scaleWidth, setScaleWidth] = useState(map.scale ? String(map.scale.width) : '');
  const [scaleUnit, setScaleUnit] = useState(map.scale?.unit ?? 'mi');
  const [modes, setModes] = useState<ModeRow[]>(() => modeRows(map));
  const [newImage, setNewImage] = useState<File | null>(null);
  const [fog, setFog] = useState(map.fogEnabled);
  const updateMap = useUpdateMap(world.id);
  const replaceImage = useReplaceMapImage(world.id);
  const deleteMap = useDeleteMap(world.id);

  const shownEntity = entity === undefined ? map.entity : entity;
  const shownType = shownEntity ? typeById.get(shownEntity.typeId) : undefined;
  // A map can't go inside itself or its own maps.
  const blocked = descendantIds(maps, map.id).add(map.id);

  /** The scale to save: undefined = unchanged, null = remove, or 'invalid' with an error shown. */
  function readScale(): MapUpdateInput['scale'] | 'invalid' {
    if (!scaleWidth.trim()) return map.scale ? null : undefined;
    const width = Number(scaleWidth);
    if (!Number.isFinite(width) || width <= 0) {
      toast.error('The width of the map must be a number above zero');
      return 'invalid';
    }
    const kept = modes.filter((m) => m.name.trim() || m.perDay.trim());
    const parsed = kept.map((m) => ({ name: m.name.trim(), perDay: Number(m.perDay) }));
    if (parsed.some((m) => !m.name || !Number.isFinite(m.perDay) || m.perDay <= 0)) {
      toast.error('Give each way of travelling a name and a distance per day above zero');
      return 'invalid';
    }
    return { width, unit: scaleUnit.trim() || 'mi', modes: parsed };
  }

  async function onReplaceImage() {
    if (!newImage) return;
    const shape = map.width / map.height;
    try {
      const updated = await replaceImage.mutateAsync({ id: map.id, image: newImage });
      setNewImage(null);
      setOpen(false);
      toast.success('Image replaced. The map is being prepared again.');
      if (Math.abs(updated.width / updated.height / shape - 1) > 0.01) {
        toast.warning(
          'The new image is a different shape, so pins and shapes keep their relative positions and may need a nudge.',
        );
      }
    } catch (error) {
      toast.error(errorMessage(error));
    }
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const scale = readScale();
    if (scale === 'invalid') return;
    try {
      await updateMap.mutateAsync({
        id: map.id,
        name: String(form.get('name')),
        description: String(form.get('description')),
        parentId: String(form.get('parentId')) || null,
        visibility,
        fogEnabled: fog,
        ...(scale !== undefined ? { scale } : {}),
        ...(entity !== undefined ? { entityId: entity?.id ?? null } : {}),
      });
      setOpen(false);
    } catch (error) {
      toast.error(errorMessage(error));
    }
  }

  async function onDelete() {
    try {
      await deleteMap.mutateAsync(map.id);
      toast.success(`Deleted ${map.name}`);
      void navigate(`${base}/atlas`);
    } catch (error) {
      toast.error(errorMessage(error));
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) setEntity(undefined);
        if (next) {
          setScaleWidth(map.scale ? String(map.scale.width) : '');
          setScaleUnit(map.scale?.unit ?? 'mi');
          setModes(modeRows(map));
          setNewImage(null);
          setFog(map.fogEnabled);
        }
      }}
    >
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent title="Map settings">
        <section className="mb-4 space-y-2 rounded-lg border p-3">
          <Label htmlFor="settings-image">Map image</Label>
          <p className="text-xs text-muted-foreground">
            {map.width.toLocaleString()} × {map.height.toLocaleString()} px. A replacement keeps
            every pin, label, path and region where it is.
          </p>
          <div className="flex items-center gap-2">
            <Input
              id="settings-image"
              type="file"
              accept="image/png,image/jpeg,image/webp,image/tiff,image/avif,image/svg+xml,.svg"
              onChange={(event) => setNewImage(event.target.files?.[0] ?? null)}
            />
            <Button
              type="button"
              variant="outline"
              disabled={!newImage || replaceImage.isPending}
              onClick={() => void onReplaceImage()}
            >
              <Upload /> {replaceImage.isPending ? 'Uploading…' : 'Replace'}
            </Button>
          </div>
        </section>
        <ImportGeoJson map={map} />
        <form onSubmit={onSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="settings-name">Name</Label>
            <Input
              id="settings-name"
              name="name"
              required
              maxLength={120}
              defaultValue={map.name}
            />
          </div>
          <label className="flex items-start gap-2 text-sm">
            <input
              type="checkbox"
              className="mt-1"
              checked={fog}
              onChange={(event) => setFog(event.target.checked)}
            />
            <span>
              Fog of war
              <span className="block text-xs text-muted-foreground">
                Players see only the areas you mark with the Reveal tool. The picture they are sent
                is covered outside those areas, and pins outside them are not sent at all. You
                always see everything.
              </span>
            </span>
          </label>
          <div className="space-y-1.5">
            <Label htmlFor="settings-parent">Sits inside</Label>
            <NativeSelect id="settings-parent" name="parentId" defaultValue={map.parentId ?? ''}>
              <option value="">Nothing: a top-level map</option>
              {maps
                .filter((m) => !blocked.has(m.id))
                .map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name}
                  </option>
                ))}
            </NativeSelect>
          </div>
          <div className="space-y-1.5">
            <Label>Shows this entry</Label>
            <div className="flex items-center gap-2">
              <EntityPicker
                onSelect={setEntity}
                trigger={
                  <Button variant="outline" className="min-w-0 flex-1 justify-start">
                    {shownEntity ? (
                      <>
                        <EntityIcon
                          icon={shownType?.icon ?? 'file-text'}
                          color={shownType?.color}
                        />
                        <span className="truncate">{shownEntity.name}</span>
                      </>
                    ) : (
                      <>
                        <Link2 />{' '}
                        <span className="text-muted-foreground">Optional: link a place</span>
                      </>
                    )}
                  </Button>
                }
              />
              {shownEntity ? (
                <Button variant="ghost" size="icon" onClick={() => setEntity(null)}>
                  <X />
                  <span className="sr-only">Clear</span>
                </Button>
              ) : null}
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="settings-visibility">Who can open it</Label>
            <VisibilitySelect
              id="settings-visibility"
              value={visibility}
              onChange={setVisibility}
            />
          </div>
          <fieldset className="space-y-2 rounded-lg border p-3">
            <legend className="px-1 text-sm font-medium">Scale and travel</legend>
            <p className="text-xs text-muted-foreground">
              How far the whole map spans lets the Measure tool give distances and travel times.
              Leave the width empty for no scale.
            </p>
            <div className="flex items-end gap-2">
              <div className="min-w-0 flex-1 space-y-1">
                <Label htmlFor="scale-width">Width of the whole map</Label>
                <Input
                  id="scale-width"
                  inputMode="decimal"
                  value={scaleWidth}
                  onChange={(event) => setScaleWidth(event.target.value)}
                  placeholder="e.g. 900"
                />
              </div>
              <div className="w-28 space-y-1">
                <Label htmlFor="scale-unit">Unit</Label>
                <Input
                  id="scale-unit"
                  list="scale-units"
                  value={scaleUnit}
                  maxLength={12}
                  onChange={(event) => setScaleUnit(event.target.value)}
                />
                <datalist id="scale-units">
                  <option value="mi" />
                  <option value="km" />
                  <option value="leagues" />
                </datalist>
              </div>
            </div>
            <div className="space-y-1.5">
              {modes.map((mode, index) => (
                <div key={index} className="flex items-center gap-2">
                  <Input
                    aria-label={'Way of travelling ' + (index + 1)}
                    value={mode.name}
                    maxLength={24}
                    placeholder="On foot"
                    onChange={(event) =>
                      setModes((rows) =>
                        rows.map((r, i) => (i === index ? { ...r, name: event.target.value } : r)),
                      )
                    }
                  />
                  <Input
                    aria-label={'Distance per day ' + (index + 1)}
                    className="w-24"
                    inputMode="decimal"
                    value={mode.perDay}
                    placeholder="per day"
                    onChange={(event) =>
                      setModes((rows) =>
                        rows.map((r, i) =>
                          i === index ? { ...r, perDay: event.target.value } : r,
                        ),
                      )
                    }
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    onClick={() => setModes((rows) => rows.filter((_, i) => i !== index))}
                  >
                    <X />
                    <span className="sr-only">Remove</span>
                  </Button>
                </div>
              ))}
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={modes.length >= 8}
                  onClick={() => setModes((rows) => [...rows, { name: '', perDay: '' }])}
                >
                  <Plus /> Add a pace
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() =>
                    setModes(
                      defaultTravelModes(scaleUnit).map((m) => ({
                        name: m.name,
                        perDay: String(m.perDay),
                      })),
                    )
                  }
                >
                  Use typical paces
                </Button>
              </div>
            </div>
          </fieldset>
          <div className="space-y-1.5">
            <Label htmlFor="settings-description">Description</Label>
            <Textarea
              id="settings-description"
              name="description"
              maxLength={2000}
              defaultValue={map.description}
            />
          </div>
          <DialogFooter className="justify-between">
            <ConfirmDialog
              trigger={
                <Button variant="outline" className="text-destructive">
                  <Trash2 /> Delete map
                </Button>
              }
              title={`Delete ${map.name}?`}
              description="The image and everything drawn on it are deleted for good. Maps inside it move up to the top level."
              onConfirm={onDelete}
            />
            <Button type="submit" disabled={updateMap.isPending}>
              Save
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
