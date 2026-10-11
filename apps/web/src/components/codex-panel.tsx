import { ExternalLink, Search, X } from 'lucide-react';
import { Link } from 'react-router';
import { richTextToPlainText } from '@atlas/shared';
import { useEntity, useEntityRelationships } from '@/api/queries';
import { EntityIcon } from '@/components/entity-icon';
import { EntityPicker } from '@/components/entity-picker';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/misc';
import { useWorld } from '@/lib/world-context';

function formatValue(value: unknown): string {
  if (Array.isArray(value)) return value.join(', ');
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  return String(value);
}

function EntitySummaryCard({ entityId }: { entityId: string }) {
  const { world, typeById, base } = useWorld();
  const { data: entity, isPending, isError } = useEntity(world.id, entityId);
  const { data: links = [] } = useEntityRelationships(world.id, entityId);

  if (isPending) return <Spinner />;
  if (isError)
    return <p className="text-sm text-muted-foreground">This entry is no longer available.</p>;

  const type = typeById.get(entity.typeId);
  const fields = (type?.fieldSchema ?? []).filter((f) => {
    const value = entity.fields[f.key];
    return value !== undefined && value !== null && value !== '';
  });
  const notes = richTextToPlainText(entity.body);

  return (
    <div className="space-y-4 text-sm">
      <div>
        <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <EntityIcon icon={type?.icon ?? 'file-text'} color={type?.color} className="size-3.5" />
          {type?.name}
        </p>
        <h3 className="mt-1 font-serif text-xl font-semibold">{entity.name}</h3>
        {entity.aliases.length ? (
          <p className="text-xs text-muted-foreground">Also {entity.aliases.join(', ')}</p>
        ) : null}
      </div>
      {entity.summary ? <p>{entity.summary}</p> : null}
      {fields.length ? (
        <dl className="space-y-2">
          {fields.map((f) => (
            <div key={f.key}>
              <dt className="text-xs text-muted-foreground">{f.label}</dt>
              <dd className="whitespace-pre-wrap">{formatValue(entity.fields[f.key])}</dd>
            </div>
          ))}
        </dl>
      ) : null}
      {links.length ? (
        <div>
          <p className="text-xs text-muted-foreground">Relationships</p>
          <ul className="mt-1 space-y-0.5">
            {links.map((link) => (
              <li key={link.id}>
                <span className="text-muted-foreground">{link.label}</span> {link.other.name}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      {notes ? <p className="line-clamp-6 text-muted-foreground">{notes}</p> : null}
      <Link
        to={`${base}/e/${entity.id}`}
        className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
      >
        Open full entry <ExternalLink className="size-3" />
      </Link>
    </div>
  );
}

/** Codex beside the manuscript: look up any entry without leaving the scene. */
export function CodexPanel({
  entityId,
  onSelect,
  onClose,
}: {
  entityId: string | null;
  onSelect: (id: string) => void;
  onClose: () => void;
}) {
  return (
    <aside className="flex flex-col rounded-xl border bg-card">
      <div className="flex items-center gap-1 border-b px-3 py-2">
        <span className="text-sm font-semibold">Codex</span>
        <EntityPicker
          onSelect={(entity) => onSelect(entity.id)}
          trigger={
            <Button variant="ghost" size="icon-sm" className="ml-auto" title="Find an entry">
              <Search />
              <span className="sr-only">Find an entry</span>
            </Button>
          }
        />
        <Button variant="ghost" size="icon-sm" onClick={onClose} title="Close Codex panel">
          <X />
          <span className="sr-only">Close Codex panel</span>
        </Button>
      </div>
      <div className="max-h-[70vh] overflow-y-auto p-4">
        {entityId ? (
          <EntitySummaryCard key={entityId} entityId={entityId} />
        ) : (
          <p className="text-sm text-muted-foreground">
            Hover an underlined name in your scene and choose <em>Show in Codex</em>, or search for
            any entry.
          </p>
        )}
      </div>
    </aside>
  );
}
