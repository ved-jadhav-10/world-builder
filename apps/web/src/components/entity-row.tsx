import { Link } from 'react-router';
import type { EntitySummary } from '@atlas/shared';
import { EntityIcon } from '@/components/entity-icon';
import { timeAgo } from '@/lib/utils';
import { VisibilityBadge } from '@/lib/visibility';
import { useWorld } from '@/lib/world-context';

export function EntityRow({
  entity,
  showType = false,
  selection,
}: {
  entity: EntitySummary;
  showType?: boolean;
  /** When given, the row has a checkbox for picking it in bulk edit. */
  selection?: { selected: boolean; onToggle: () => void };
}) {
  const { typeById, base, audience } = useWorld();
  const type = typeById.get(entity.typeId);
  return (
    <li className={selection ? 'flex items-start' : undefined}>
      {selection ? (
        <input
          type="checkbox"
          checked={selection.selected}
          onChange={selection.onToggle}
          aria-label={`Select ${entity.name}`}
          className="mt-4 size-4 shrink-0 accent-primary"
        />
      ) : null}
      <Link
        to={`${base}/e/${entity.id}`}
        className={
          selection
            ? 'flex min-w-0 flex-1 items-start gap-3 rounded-lg px-3 py-3 transition-colors hover:bg-muted'
            : 'flex items-start gap-3 rounded-lg px-3 py-3 transition-colors hover:bg-muted'
        }
      >
        <EntityIcon icon={type?.icon ?? 'file-text'} color={type?.color} className="mt-0.5" />
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline gap-2">
            <span className="truncate font-medium">{entity.name}</span>
            {audience === 'gm' ? <VisibilityBadge visibility={entity.visibility} /> : null}
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
