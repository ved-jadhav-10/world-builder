import { Star } from 'lucide-react';
import type { GalleryImage } from '@atlas/shared';
import { imageUrl } from '@/api/gm-queries';
import { VisibilityBadge } from '@/lib/visibility';
import { useWorld } from '@/lib/world-context';

/** Pictures as a grid of thumbnails; each opens in the lightbox. */
export function ImageGrid({
  images,
  onOpen,
  showEntity = false,
}: {
  images: GalleryImage[];
  onOpen: (image: GalleryImage) => void;
  /** Name the entry each picture belongs to, for galleries that mix entries. */
  showEntity?: boolean;
}) {
  const { world } = useWorld();
  return (
    <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
      {images.map((image) => (
        <li key={image.id}>
          <button
            type="button"
            onClick={() => onOpen(image)}
            className="group relative block w-full overflow-hidden rounded-lg border bg-muted text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <img
              src={imageUrl(world.id, image.id, 'thumbnail')}
              alt={image.caption || 'Picture'}
              loading="lazy"
              className="aspect-square w-full object-cover transition-transform group-hover:scale-[1.03]"
            />
            <span className="absolute left-1.5 top-1.5 flex gap-1">
              {image.isPortrait ? (
                <span
                  title="Main portrait"
                  className="inline-flex items-center rounded-full bg-card/90 p-1 text-amber-500 shadow"
                >
                  <Star className="size-3 fill-current" />
                  <span className="sr-only">Main portrait</span>
                </span>
              ) : null}
              <VisibilityBadge visibility={image.visibility} className="bg-card/90" />
            </span>
          </button>
          {image.caption || (showEntity && image.entityName) ? (
            <p className="mt-1 truncate text-xs text-muted-foreground">
              {showEntity && image.entityName ? (
                <span className="font-medium text-foreground">{image.entityName}</span>
              ) : null}
              {showEntity && image.entityName && image.caption ? ' · ' : ''}
              {image.caption}
            </p>
          ) : null}
        </li>
      ))}
    </ul>
  );
}
