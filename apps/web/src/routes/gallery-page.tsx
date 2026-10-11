import { Images } from 'lucide-react';
import { useState } from 'react';
import { useImages } from '@/api/gm-queries';
import { ImageDialog } from '@/components/gallery/image-dialog';
import { ImageGrid } from '@/components/gallery/image-grid';
import { UploadImages } from '@/components/gallery/upload-images';
import { EmptyState, PageSpinner } from '@/components/ui/misc';
import { cn } from '@/lib/utils';
import { useWorld } from '@/lib/world-context';

type Scope = 'all' | 'world';

/** Every picture in the world, or just the ones that belong to no entry (maps, handouts, mood boards). */
export function GalleryPage() {
  const { world, canEdit } = useWorld();
  const [scope, setScope] = useState<Scope>('all');
  const { data: images, isPending } = useImages(world.id, scope === 'world' ? { scope } : {});
  const [openId, setOpenId] = useState<string | null>(null);

  if (isPending) return <PageSpinner />;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-sm font-medium text-muted-foreground">Gallery</p>
          <h1 className="font-serif text-3xl font-semibold">Pictures</h1>
          <p className="mt-1 text-muted-foreground">
            {images?.length ?? 0} {images?.length === 1 ? 'picture' : 'pictures'}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div
            role="radiogroup"
            aria-label="Show"
            className="inline-flex rounded-md border bg-card p-0.5"
          >
            {(
              [
                ['all', 'Everything'],
                ['world', 'World gallery'],
              ] as const
            ).map(([value, label]) => (
              <button
                key={value}
                type="button"
                role="radio"
                aria-checked={scope === value}
                onClick={() => setScope(value)}
                className={cn(
                  'rounded px-3 py-1 text-[13px] transition-colors',
                  scope === value
                    ? 'bg-accent font-medium text-accent-foreground'
                    : 'text-muted-foreground hover:text-foreground',
                )}
              >
                {label}
              </button>
            ))}
          </div>
          {canEdit ? <UploadImages label="Add to the world gallery" /> : null}
        </div>
      </div>

      {!images?.length ? (
        <EmptyState icon={<Images />} title="No pictures yet">
          <p>
            {scope === 'world'
              ? 'Pictures that belong to the whole world, like handouts, mood boards and reference art, go here. Pictures of a character or place live on its own page.'
              : 'Add pictures to an entry from its page, or here for the whole world.'}
          </p>
        </EmptyState>
      ) : (
        <ImageGrid images={images} showEntity onOpen={(image) => setOpenId(image.id)} />
      )}
      <ImageDialog images={images ?? []} openId={openId} onClose={() => setOpenId(null)} />
    </div>
  );
}

export { GalleryPage as Component };
