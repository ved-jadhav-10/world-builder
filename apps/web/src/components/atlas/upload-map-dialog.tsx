import { ImagePlus, Link2, X } from 'lucide-react';
import { useState, type FormEvent, type ReactNode } from 'react';
import { useNavigate } from 'react-router';
import { toast } from 'sonner';
import { MAX_MAP_BYTES, type AtlasMap, type Visibility } from '@atlas/shared';
import { useCreateBlankMap, useMaps, useUploadMap } from '@/api/atlas-queries';
import { errorMessage } from '@/api/client';
import { EntityIcon } from '@/components/entity-icon';
import { EntityPicker, type PickedEntity } from '@/components/entity-picker';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogFooter, DialogTrigger } from '@/components/ui/dialog';
import { Input, Label, NativeSelect, Textarea } from '@/components/ui/inputs';
import { VisibilitySelect } from '@/lib/visibility';
import { useWorld } from '@/lib/world-context';

const ACCEPT = 'image/png,image/jpeg,image/webp,image/tiff,image/avif,image/svg+xml,.svg';
const MAX_MB = Math.round(MAX_MAP_BYTES / 1024 / 1024);

/**
 * Uploads a map image. The server cuts it into tiles in the background, so the new map opens
 * straight away with a "preparing" screen (or `onCreated` runs instead, to keep working in place).
 */
export function UploadMapDialog({
  trigger,
  defaultParentId = null,
  onCreated,
}: {
  trigger: ReactNode;
  defaultParentId?: string | null;
  onCreated?: (map: AtlasMap) => void;
}) {
  const { world, typeById, base } = useWorld();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [entity, setEntity] = useState<PickedEntity | null>(null);
  const [visibility, setVisibility] = useState<Visibility>('gm');
  const { data: maps = [] } = useMaps(world.id);
  const upload = useUploadMap(world.id);
  const createBlank = useCreateBlankMap(world.id);
  const [blank, setBlank] = useState(false);
  const [shape, setShape] = useState<'square' | 'wide' | 'tall'>('square');
  const [background, setBackground] = useState('#efe6d2');
  const busy = upload.isPending || createBlank.isPending;

  function reset() {
    setName('');
    setFile(null);
    setEntity(null);
  }

  function pickFile(picked: File | null) {
    if (picked && picked.size > MAX_MAP_BYTES) {
      toast.error(`That file is over ${MAX_MB} MB. Export a smaller version of the map.`);
      return;
    }
    setFile(picked);
    // Start from the file name, which usually says what the map is.
    if (picked && !name) setName(picked.name.replace(/\.[^.]+$/, '').replace(/[-_]+/g, ' '));
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!file && !blank) return;
    const form = new FormData(event.currentTarget);
    const common = {
      name,
      description: String(form.get('description') ?? ''),
      parentId: String(form.get('parentId') ?? '') || null,
      entityId: entity?.id ?? null,
      visibility,
    };
    try {
      const map = blank
        ? await createBlank.mutateAsync({ ...common, shape, background })
        : await upload.mutateAsync({ ...common, image: file! });
      setOpen(false);
      reset();
      if (onCreated) onCreated(map);
      else void navigate(`${base}/atlas/${map.id}`);
    } catch (error) {
      toast.error(errorMessage(error));
    }
  }

  const entityType = entity ? typeById.get(entity.typeId) : undefined;

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (busy) return;
        setOpen(next);
        if (!next) reset();
      }}
    >
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent
        title="Upload a map"
        description={`PNG, JPEG, WebP, TIFF, AVIF or SVG (as exported by map generators), up to ${MAX_MB} MB. Large maps take a few minutes to prepare for zooming.`}
      >
        <form onSubmit={onSubmit} className="space-y-4">
          <label className="flex items-center gap-1.5 text-sm">
            <input
              type="checkbox"
              checked={blank}
              onChange={(event) => setBlank(event.target.checked)}
            />
            No picture: start from a blank canvas (for node maps and pointcrawls)
          </label>
          {blank ? (
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="map-shape">Shape</Label>
                <NativeSelect
                  id="map-shape"
                  value={shape}
                  onChange={(event) => setShape(event.target.value as typeof shape)}
                >
                  <option value="square">Square</option>
                  <option value="wide">Wide</option>
                  <option value="tall">Tall</option>
                </NativeSelect>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="map-background">Colour</Label>
                <input
                  id="map-background"
                  type="color"
                  value={background}
                  onChange={(event) => setBackground(event.target.value)}
                  className="h-9 w-full cursor-pointer rounded-md border bg-transparent p-1"
                />
              </div>
            </div>
          ) : null}
          <div className={blank ? 'hidden' : 'space-y-1.5'}>
            <Label htmlFor="map-image">Image</Label>
            <label
              htmlFor="map-image"
              className="flex cursor-pointer items-center gap-3 rounded-md border border-dashed bg-card px-3 py-3 text-sm hover:border-primary/50"
            >
              <ImagePlus className="size-5 shrink-0 text-muted-foreground" />
              <span className="min-w-0 flex-1 truncate">
                {file ? file.name : 'Choose an image…'}
              </span>
              {file ? (
                <span className="shrink-0 text-xs text-muted-foreground">
                  {(file.size / 1024 / 1024).toFixed(1)} MB
                </span>
              ) : null}
            </label>
            <input
              id="map-image"
              type="file"
              accept={ACCEPT}
              required={!blank}
              className="sr-only"
              onChange={(event) => pickFile(event.target.files?.[0] ?? null)}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="map-name">Name</Label>
            <Input
              id="map-name"
              required
              maxLength={120}
              value={name}
              onChange={(event) => setName(event.target.value)}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="map-parent">Sits inside</Label>
            <NativeSelect id="map-parent" name="parentId" defaultValue={defaultParentId ?? ''}>
              <option value="">Nothing: a top-level map</option>
              {maps.map((map) => (
                <option key={map.id} value={map.id}>
                  {map.name}
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
                    {entity ? (
                      <>
                        <EntityIcon
                          icon={entityType?.icon ?? 'file-text'}
                          color={entityType?.color}
                        />
                        <span className="truncate">{entity.name}</span>
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
              {entity ? (
                <Button variant="ghost" size="icon" onClick={() => setEntity(null)}>
                  <X />
                  <span className="sr-only">Clear</span>
                </Button>
              ) : null}
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="map-visibility">Who can open it</Label>
            <VisibilitySelect id="map-visibility" value={visibility} onChange={setVisibility} />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="map-description">Description</Label>
            <Textarea id="map-description" name="description" maxLength={2000} />
          </div>

          <DialogFooter>
            <Button type="submit" disabled={(!file && !blank) || !name.trim() || busy}>
              {busy ? 'Working…' : blank ? 'Create' : 'Upload'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
