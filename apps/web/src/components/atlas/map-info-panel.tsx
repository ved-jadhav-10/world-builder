import { ExternalLink } from 'lucide-react';
import { Link } from 'react-router';
import { FEATURE_KIND_LABELS, type AtlasMap, type MapFeature } from '@atlas/shared';
import { EntityIcon } from '@/components/entity-icon';
import { childMaps } from '@/lib/atlas-tree';
import { FEATURE_KIND_ICONS } from '@/lib/feature-kind-icons';
import { resolveStyle } from '@/lib/map-style';
import { useWorld } from '@/lib/world-context';

/** What the side panel shows while nothing is selected: the map itself and what is on it. */
export function MapInfoPanel({
  map,
  maps,
  features,
  canEdit,
  onPick,
}: {
  map: AtlasMap;
  maps: AtlasMap[];
  features: MapFeature[];
  canEdit: boolean;
  onPick: (id: string) => void;
}) {
  const { base, typeById } = useWorld();
  const inside = childMaps(maps, map.id);
  const entityType = map.entity ? typeById.get(map.entity.typeId) : undefined;
  const named = features
    .map((feature) => ({ feature, style: resolveStyle(feature, typeById) }))
    .filter(({ style }) => style.name)
    .sort((a, b) => a.style.name.localeCompare(b.style.name));

  return (
    <div className="space-y-6 p-4">
      <div>
        <h2 className="font-serif text-xl font-semibold">{map.name}</h2>
        <p className="text-xs text-muted-foreground">
          {map.width.toLocaleString()} × {map.height.toLocaleString()} px
        </p>
        {map.description ? (
          <p className="mt-2 whitespace-pre-wrap text-sm">{map.description}</p>
        ) : null}
      </div>

      {map.entity ? (
        <Link
          to={`${base}/e/${map.entity.id}`}
          className="group flex items-center gap-2 rounded-lg border bg-card p-3 text-sm font-medium"
        >
          <EntityIcon icon={entityType?.icon ?? 'file-text'} color={entityType?.color} />
          <span className="truncate group-hover:underline">{map.entity.name}</span>
          <ExternalLink className="ml-auto size-3.5 shrink-0 text-muted-foreground" />
        </Link>
      ) : null}

      {inside.length > 0 ? (
        <section className="space-y-2">
          <h3 className="text-sm font-semibold">Maps inside</h3>
          <ul className="space-y-1">
            {inside.map((child) => (
              <li key={child.id}>
                <Link
                  to={`${base}/atlas/${child.id}`}
                  className="block truncate rounded-md px-2 py-1 text-sm hover:bg-muted"
                >
                  {child.name}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section className="space-y-2">
        <h3 className="text-sm font-semibold">On this map</h3>
        {named.length > 0 ? (
          <ul className="space-y-0.5">
            {named.map(({ feature, style }) => {
              const Icon = FEATURE_KIND_ICONS[feature.kind];
              return (
                <li key={feature.id}>
                  <button
                    type="button"
                    onClick={() => onPick(feature.id)}
                    className="flex w-full items-center gap-2 rounded-md px-2 py-1 text-left text-sm hover:bg-muted"
                  >
                    <Icon className="size-4 shrink-0" style={{ color: style.color }} />
                    <span className="truncate">{style.name}</span>
                    <span className="ml-auto shrink-0 text-xs text-muted-foreground">
                      {FEATURE_KIND_LABELS[feature.kind]}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground">
            {canEdit
              ? 'Nothing named yet. Pick a tool above, then click the map to drop a pin, write a label, or draw a road, river or border.'
              : 'Nothing has been added to this map yet.'}
          </p>
        )}
      </section>
    </div>
  );
}
