import { Link2, Trash2, X } from 'lucide-react';
import { useState, type FormEvent, type ReactNode } from 'react';
import { useNavigate } from 'react-router';
import { toast } from 'sonner';
import type { AtlasMap, Visibility } from '@atlas/shared';
import { useDeleteMap, useUpdateMap } from '@/api/atlas-queries';
import { errorMessage } from '@/api/client';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { EntityIcon } from '@/components/entity-icon';
import { EntityPicker } from '@/components/entity-picker';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogFooter, DialogTrigger } from '@/components/ui/dialog';
import { Input, Label, NativeSelect, Textarea } from '@/components/ui/inputs';
import { descendantIds } from '@/lib/atlas-tree';
import { VisibilitySelect } from '@/lib/visibility';
import { useWorld } from '@/lib/world-context';

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
  const updateMap = useUpdateMap(world.id);
  const deleteMap = useDeleteMap(world.id);

  const shownEntity = entity === undefined ? map.entity : entity;
  const shownType = shownEntity ? typeById.get(shownEntity.typeId) : undefined;
  // A map can't go inside itself or its own maps.
  const blocked = descendantIds(maps, map.id).add(map.id);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    try {
      await updateMap.mutateAsync({
        id: map.id,
        name: String(form.get('name')),
        description: String(form.get('description')),
        parentId: String(form.get('parentId')) || null,
        visibility,
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
      }}
    >
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent title="Map settings">
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
