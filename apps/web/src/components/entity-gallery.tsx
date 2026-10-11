import { Images } from 'lucide-react';
import { useState } from 'react';
import type { Entity } from '@atlas/shared';
import { imageUrl, useImages } from '@/api/gm-queries';
import { ImageDialog } from '@/components/gallery/image-dialog';
import { ImageGrid } from '@/components/gallery/image-grid';
import { UploadImages } from '@/components/gallery/upload-images';
import { Spinner } from '@/components/ui/misc';
import { cn } from '@/lib/utils';
import { useWorld } from '@/lib/world-context';

/** An entry's pictures: portraits, outfits, ages. The first picture added is its main portrait. */
export function EntityGallery({ entity }: { entity: Entity }) {
  const { world, canEdit } = useWorld();
  const { data: images, isPending } = useImages(world.id, { entityId: entity.id });
  const [openId, setOpenId] = useState<string | null>(null);

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 text-sm font-semibold">
          <Images className="size-4 text-muted-foreground" /> Gallery
        </h2>
        {canEdit ? <UploadImages entityId={entity.id} visibility={entity.visibility} /> : null}
      </div>
      {isPending ? (
        <Spinner />
      ) : !images?.length ? (
        <p className="text-sm text-muted-foreground">
          {canEdit
            ? 'No pictures yet. Add a portrait, or one for each stage of life, and tag them to a scene or date.'
            : 'No pictures yet.'}
        </p>
      ) : (
        <ImageGrid images={images} onOpen={(image) => setOpenId(image.id)} />
      )}
      <ImageDialog images={images ?? []} openId={openId} onClose={() => setOpenId(null)} />
    </section>
  );
}

/** The entry's main portrait as a small round picture, if it has one. */
export function EntityPortrait({ entityId, className }: { entityId: string; className?: string }) {
  const { world } = useWorld();
  const { data: images } = useImages(world.id, { entityId });
  const portrait = images?.find((image) => image.isPortrait);
  if (!portrait) return null;
  return (
    <img
      src={imageUrl(world.id, portrait.id, 'thumbnail')}
      alt=""
      className={cn('size-14 shrink-0 rounded-full border object-cover', className)}
    />
  );
}
