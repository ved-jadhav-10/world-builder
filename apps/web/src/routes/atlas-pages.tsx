import { CircleAlert, Map as MapIcon, Upload } from 'lucide-react';
import { Link } from 'react-router';
import type { AtlasMap } from '@atlas/shared';
import { thumbnailUrl, useMaps } from '@/api/atlas-queries';
import { UploadMapDialog } from '@/components/atlas/upload-map-dialog';
import { Button } from '@/components/ui/button';
import { EmptyState, PageSpinner, Spinner } from '@/components/ui/misc';
import { childMaps } from '@/lib/atlas-tree';
import { VisibilityBadge } from '@/lib/visibility';
import { useWorld } from '@/lib/world-context';

function Thumbnail({ map, worldId }: { map: AtlasMap; worldId: string }) {
  if (map.status === 'ready') {
    return (
      <img
        src={thumbnailUrl(worldId, map.id)}
        alt=""
        loading="lazy"
        className="aspect-8/5 w-full object-cover"
      />
    );
  }
  return (
    <div className="flex aspect-8/5 w-full flex-col items-center justify-center gap-2 bg-muted text-sm text-muted-foreground">
      {map.status === 'processing' ? (
        <>
          <Spinner className="size-5" /> Preparing…
        </>
      ) : (
        <>
          <CircleAlert className="size-5" /> Needs attention
        </>
      )}
    </div>
  );
}

function MapCard({ map, maps }: { map: AtlasMap; maps: AtlasMap[] }) {
  const { world, base, audience } = useWorld();
  const inside = childMaps(maps, map.id);
  return (
    <div className="overflow-hidden rounded-xl border bg-card transition-shadow hover:shadow-md">
      <Link to={`${base}/atlas/${map.id}`} className="block">
        <Thumbnail map={map} worldId={world.id} />
        <div className="space-y-0.5 p-3">
          <div className="flex items-center gap-2">
            <h2 className="truncate font-serif text-lg font-semibold">{map.name}</h2>
            {audience === 'gm' ? <VisibilityBadge visibility={map.visibility} /> : null}
          </div>
          <p className="text-xs text-muted-foreground">
            {map.width.toLocaleString()} × {map.height.toLocaleString()} px · {map.featureCount}{' '}
            {map.featureCount === 1 ? 'item' : 'items'}
          </p>
        </div>
      </Link>
      {inside.length > 0 ? (
        <div className="border-t px-3 py-2 text-xs text-muted-foreground">
          Inside:{' '}
          {inside.slice(0, 4).map((child, index) => (
            <span key={child.id}>
              {index > 0 ? ', ' : ''}
              <Link to={`${base}/atlas/${child.id}`} className="text-foreground hover:underline">
                {child.name}
              </Link>
            </span>
          ))}
          {inside.length > 4 ? ` and ${inside.length - 4} more` : ''}
        </div>
      ) : null}
    </div>
  );
}

/** Every top-level map, with the maps inside each one. */
export function AtlasIndexPage() {
  const { world, canEdit } = useWorld();
  const { data: maps, isPending } = useMaps(world.id);

  if (isPending) return <PageSpinner />;
  const topLevel = (maps ?? []).filter((m) => m.parentId === null);

  const upload = (
    <UploadMapDialog
      trigger={
        <Button>
          <Upload /> Upload a map
        </Button>
      }
    />
  );

  if (!maps?.length) {
    return (
      <EmptyState icon={<MapIcon />} title="Start your atlas">
        <p>
          Upload a map from Inkarnate, Wonderdraft, Azgaar or any image. It is cut into tiles so
          even huge maps zoom smoothly. Then pin places, draw roads and borders, and open maps
          inside maps.
        </p>
        {canEdit ? <div className="mt-4">{upload}</div> : null}
      </EmptyState>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-sm font-medium text-muted-foreground">Atlas</p>
          <h1 className="font-serif text-3xl font-semibold">Maps</h1>
          <p className="mt-1 text-muted-foreground">
            {maps.length} {maps.length === 1 ? 'map' : 'maps'}
          </p>
        </div>
        {canEdit ? upload : null}
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {topLevel.map((map) => (
          <MapCard key={map.id} map={map} maps={maps} />
        ))}
      </div>
    </div>
  );
}
