import { Map as MapIcon } from 'lucide-react';
import { Link } from 'react-router';
import { FEATURE_KIND_LABELS } from '@atlas/shared';
import { useEntityMaps } from '@/api/atlas-queries';
import { Badge } from '@/components/ui/misc';
import { useWorld } from '@/lib/world-context';

/** The maps that show this entry, and the pins and areas on any map that point at it. */
export function EntityMaps({ entityId }: { entityId: string }) {
  const { world, base } = useWorld();
  const { data: links } = useEntityMaps(world.id, entityId);
  if (!links?.length) return null;

  return (
    <section className="space-y-3">
      <h2 className="flex items-center gap-2 text-sm font-semibold">
        <MapIcon className="size-4 text-muted-foreground" /> On the map
      </h2>
      <ul className="space-y-2">
        {links.map((link) => (
          <li key={link.featureId ?? link.mapId}>
            <Link
              to={`${base}/atlas/${link.mapId}${link.featureId ? `?feature=${link.featureId}` : ''}`}
              className="group flex items-center gap-2 text-sm"
            >
              <span className="font-medium group-hover:underline">{link.mapName}</span>
              <Badge>{link.kind ? FEATURE_KIND_LABELS[link.kind] : 'Shown by this map'}</Badge>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
