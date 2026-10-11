import { Link } from 'react-router';
import type { EntitySummary } from '@atlas/shared';
import { EntityIcon } from '@/components/entity-icon';
import { timeAgo } from '@/lib/utils';
import { useWorld } from '@/lib/world-context';

export function EntityRow({
  entity,
  showType = false,
}: {
  entity: EntitySummary;
  showType?: boolean;
}) {
  const { typeById, base } = useWorld();
  const type = typeById.get(entity.typeId);
  return (
    <li>
      <Link
        to={`${base}/e/${entity.id}`}
        className="flex items-start gap-3 rounded-lg px-3 py-3 transition-colors hover:bg-muted"
      >
        <EntityIcon icon={type?.icon ?? 'file-text'} color={type?.color} className="mt-0.5" />
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline gap-2">
            <span className="truncate font-medium">{entity.name}</span>
            {entity.aliases.length ? (
              <span className="truncate text-xs text-muted-foreground">
                {entity.aliases.join(' · ')}
              </span>
            ) : null}
          </div>
          {entity.summary ? (
            <p className="mt-0.5 line-clamp-2 text-sm text-muted-foreground">{entity.summary}</p>
          ) : null}
        </div>
        <span className="shrink-0 text-xs text-muted-foreground">
          {showType && type ? `${type.name} · ` : ''}
          {timeAgo(entity.updatedAt)}
        </span>
      </Link>
    </li>
  );
}
