import { ExternalLink, Star, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router';
import { toast } from 'sonner';
import type { GalleryImage, ImageUpdateInput } from '@atlas/shared';
import { errorMessage } from '@/api/client';
import { imageUrl, useDeleteImage, useUpdateImage } from '@/api/gm-queries';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { DateField } from '@/components/date-field';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Input, Label, NativeSelect } from '@/components/ui/inputs';
import { useAnchorLabel, useScenes } from '@/lib/as-of';
import { VisibilitySelect } from '@/lib/visibility';
import { useWorld } from '@/lib/world-context';

type Tag = 'none' | 'scene' | 'day';

function ImageDetails({ image, onClose }: { image: GalleryImage; onClose: () => void }) {
  const { world, canEdit, base } = useWorld();
  const { options: scenes } = useScenes();
  const anchorLabel = useAnchorLabel();
  const update = useUpdateImage(world.id);
  const remove = useDeleteImage(world.id);
  const [caption, setCaption] = useState(image.caption);
  const [tag, setTag] = useState<Tag>(
    image.sceneId ? 'scene' : image.day !== null ? 'day' : 'none',
  );

  const save = (patch: ImageUpdateInput) =>
    update.mutate(
      { id: image.id, ...patch },
      { onError: (error) => toast.error(errorMessage(error)) },
    );
  const tagged = image.sceneId || image.day !== null;

  return (
    <div className="space-y-5">
      <img
        src={imageUrl(world.id, image.id)}
        alt={image.caption || 'Picture'}
        className="mx-auto max-h-[55dvh] w-auto max-w-full rounded-lg border bg-muted object-contain"
      />

      {image.entityId ? (
        <Link
          to={`${base}/e/${image.entityId}`}
          onClick={onClose}
          className="inline-flex items-center gap-1.5 text-sm font-medium hover:underline"
        >
          {image.entityName ?? 'Open entry'} <ExternalLink className="size-3.5" />
        </Link>
      ) : null}

      {canEdit ? (
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="image-caption">Caption</Label>
            <Input
              id="image-caption"
              value={caption}
              maxLength={300}
              onChange={(event) => setCaption(event.target.value)}
              onBlur={() => caption.trim() !== image.caption && save({ caption: caption.trim() })}
              onKeyDown={(event) => event.key === 'Enter' && event.currentTarget.blur()}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="image-visibility">Who can see it</Label>
            <VisibilitySelect
              id="image-visibility"
              value={image.visibility}
              onChange={(visibility) => save({ visibility })}
            />
          </div>
          {image.entityId ? (
            <fieldset className="space-y-2">
              <legend className="text-[13px] font-medium text-muted-foreground">
                Shows the entry at a point in the story
              </legend>
              <div className="flex gap-4 text-sm">
                {(
                  [
                    ['none', 'Always'],
                    ['scene', 'From a scene'],
                    ['day', 'From a date'],
                  ] as const
                ).map(([value, label]) => (
                  <label key={value} className="flex items-center gap-1.5">
                    <input
                      type="radio"
                      name="image-tag"
                      checked={tag === value}
                      disabled={value === 'scene' && scenes.length === 0}
                      onChange={() => {
                        setTag(value);
                        if (value === 'none') save({ sceneId: null, day: null });
                      }}
                    />
                    {label}
                  </label>
                ))}
              </div>
              {tag === 'scene' ? (
                <NativeSelect
                  aria-label="Scene"
                  value={image.sceneId ?? ''}
                  onChange={(event) => event.target.value && save({ sceneId: event.target.value })}
                >
                  <option value="">Choose a scene…</option>
                  {scenes.map((scene) => (
                    <option key={scene.id} value={scene.id}>
                      {scene.label}
                    </option>
                  ))}
                </NativeSelect>
              ) : null}
              {tag === 'day' ? (
                <DateField
                  label="Date"
                  value={image.day}
                  onChange={(day) => save({ day, sceneId: null })}
                />
              ) : null}
              <p className="text-xs text-muted-foreground">
                Viewing the entry “as of” a later moment shows the latest picture from before it.
              </p>
            </fieldset>
          ) : null}
          <div className="flex flex-wrap gap-2">
            {image.entityId && !image.isPortrait ? (
              <Button variant="outline" size="sm" onClick={() => save({ portrait: true })}>
                <Star /> Use as the main portrait
              </Button>
            ) : null}
            <ConfirmDialog
              title="Delete this picture?"
              description="The picture is removed for good."
              onConfirm={async () => {
                try {
                  await remove.mutateAsync(image.id);
                  onClose();
                } catch (error) {
                  toast.error(errorMessage(error));
                }
              }}
              trigger={
                <Button variant="outline" size="sm" className="text-destructive">
                  <Trash2 /> Delete
                </Button>
              }
            />
          </div>
        </div>
      ) : (
        <div className="space-y-1 text-sm">
          {image.caption ? <p>{image.caption}</p> : null}
          {tagged ? (
            <p className="text-muted-foreground">
              From {anchorLabel({ sceneId: image.sceneId, day: image.day })}
            </p>
          ) : null}
        </div>
      )}
    </div>
  );
}

/** A picture at full size, with its details. Pass the picture's ID to open it, null to close. */
export function ImageDialog({
  images,
  openId,
  onClose,
}: {
  images: GalleryImage[];
  openId: string | null;
  onClose: () => void;
}) {
  const image = images.find((i) => i.id === openId);
  return (
    <Dialog open={Boolean(image)} onOpenChange={(open) => !open && onClose()}>
      {image ? (
        <DialogContent
          className="top-[5dvh] max-h-[90dvh] max-w-2xl overflow-y-auto"
          title={image.caption || 'Picture'}
          description={image.entityName ?? 'In the world gallery'}
        >
          <ImageDetails key={image.id} image={image} onClose={onClose} />
        </DialogContent>
      ) : null}
    </Dialog>
  );
}
