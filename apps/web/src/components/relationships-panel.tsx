import { Link2, Plus, X } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Link } from 'react-router';
import { toast } from 'sonner';
import type { Entity, EntityRelationship } from '@atlas/shared';
import { errorMessage } from '@/api/client';
import {
  useCreateRelationship,
  useDeleteRelationship,
  useEntityRelationships,
  useRelationshipTypes,
} from '@/api/queries';
import { EntityIcon } from '@/components/entity-icon';
import { EntityPicker } from '@/components/entity-picker';
import { Button } from '@/components/ui/button';
import { NativeSelect } from '@/components/ui/inputs';
import { Spinner } from '@/components/ui/misc';
import { useWorld } from '@/lib/world-context';

/** A relationship type read from this entity's side: "located in" (out) or "contains" (in). */
interface LinkOption {
  value: string;
  label: string;
  typeId: string;
  reverse: boolean;
}

export function RelationshipsPanel({ entity }: { entity: Entity }) {
  const { world, typeById, base, canEdit } = useWorld();
  const { data: links, isPending } = useEntityRelationships(world.id, entity.id);
  const { data: relTypes = [] } = useRelationshipTypes(world.id);
  const createLink = useCreateRelationship(world.id);
  const deleteLink = useDeleteRelationship(world.id);
  const [optionValue, setOptionValue] = useState('');

  const options = useMemo<LinkOption[]>(
    () =>
      relTypes
        .flatMap((t) => [
          { value: `${t.id}:out`, label: t.label, typeId: t.id, reverse: false },
          ...(t.inverseLabel !== t.label
            ? [{ value: `${t.id}:in`, label: t.inverseLabel, typeId: t.id, reverse: true }]
            : []),
        ])
        .sort((a, b) => a.label.localeCompare(b.label)),
    [relTypes],
  );
  const selected = options.find((o) => o.value === optionValue) ?? options[0];

  const grouped = useMemo(() => {
    const groups = new Map<string, EntityRelationship[]>();
    for (const link of links ?? [])
      groups.set(link.label, [...(groups.get(link.label) ?? []), link]);
    return [...groups.entries()];
  }, [links]);

  async function addLink(other: { id: string }) {
    if (!selected) return;
    try {
      await createLink.mutateAsync({
        typeId: selected.typeId,
        sourceId: selected.reverse ? other.id : entity.id,
        targetId: selected.reverse ? entity.id : other.id,
      });
    } catch (error) {
      toast.error(errorMessage(error));
    }
  }

  return (
    <section className="space-y-3">
      <h2 className="flex items-center gap-2 text-sm font-semibold">
        <Link2 className="size-4 text-muted-foreground" /> Relationships
      </h2>

      {isPending ? (
        <Spinner />
      ) : grouped.length === 0 ? (
        <p className="text-sm text-muted-foreground">Not linked to anything yet.</p>
      ) : (
        <dl className="space-y-3">
          {grouped.map(([label, items]) => (
            <div key={label}>
              <dt className="text-xs font-medium text-muted-foreground">{label}</dt>
              <dd className="mt-1 space-y-1">
                {items.map((link) => {
                  const type = typeById.get(link.other.typeId);
                  return (
                    <div key={link.id} className="group flex items-center gap-2 text-sm">
                      <EntityIcon icon={type?.icon ?? 'file-text'} color={type?.color} />
                      <Link to={`${base}/e/${link.other.id}`} className="truncate hover:underline">
                        {link.other.name}
                      </Link>
                      {canEdit ? (
                        <button
                          type="button"
                          aria-label={`Remove link to ${link.other.name}`}
                          className="ml-auto text-muted-foreground opacity-0 transition-opacity hover:text-destructive focus:opacity-100 group-hover:opacity-100"
                          onClick={() =>
                            deleteLink.mutate(link.id, {
                              onError: (error) => toast.error(errorMessage(error)),
                            })
                          }
                        >
                          <X className="size-3.5" />
                        </button>
                      ) : null}
                    </div>
                  );
                })}
              </dd>
            </div>
          ))}
        </dl>
      )}

      {canEdit && options.length ? (
        <div className="flex gap-2 border-t pt-3">
          <NativeSelect
            aria-label="Relationship"
            className="h-8 min-w-0 flex-1 text-[13px]"
            value={selected?.value}
            onChange={(e) => setOptionValue(e.target.value)}
          >
            {options.map((option) => (
              <option key={option.value} value={option.value}>
                {entity.name} — {option.label} …
              </option>
            ))}
          </NativeSelect>
          <EntityPicker
            excludeId={entity.id}
            onSelect={addLink}
            trigger={
              <Button size="sm" variant="outline" disabled={createLink.isPending}>
                <Plus /> Link
              </Button>
            }
          />
        </div>
      ) : null}
    </section>
  );
}
