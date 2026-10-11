import { CalendarClock, Link2, Plus, X } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Link } from 'react-router';
import { toast } from 'sonner';
import { isActiveAt, type Entity, type EntityRelationship, type StoryPoint } from '@atlas/shared';
import { errorMessage } from '@/api/client';
import {
  useCreateRelationship,
  useDeleteRelationship,
  useEntityRelationships,
  useRelationshipTypes,
  useUpdateRelationship,
} from '@/api/queries';
import { DateField } from '@/components/date-field';
import { EntityIcon } from '@/components/entity-icon';
import { EntityPicker } from '@/components/entity-picker';
import { Button } from '@/components/ui/button';
import { Label, NativeSelect } from '@/components/ui/inputs';
import { Spinner } from '@/components/ui/misc';
import { useDates } from '@/lib/use-dates';
import { useWorld } from '@/lib/world-context';

/** A relationship type read from this entity's side: "located in" (out) or "contains" (in). */
interface LinkOption {
  value: string;
  label: string;
  typeId: string;
  reverse: boolean;
}

/**
 * An entry's links. Each can hold for a period of in-world time; given an `asOf` point, only
 * the links that hold then are shown.
 */
export function RelationshipsPanel({
  entity,
  asOf = null,
  readOnly = false,
}: {
  entity: Entity;
  asOf?: StoryPoint | null;
  readOnly?: boolean;
}) {
  const { world, typeById, base, canEdit: canEditWorld } = useWorld();
  const canEdit = canEditWorld && !readOnly;
  const dates = useDates();
  const updateLink = useUpdateRelationship(world.id);
  const [periodFor, setPeriodFor] = useState<string | null>(null);
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
    for (const link of links ?? []) {
      if (!isActiveAt(link.validFromDay, link.validToDay, asOf)) continue;
      groups.set(link.label, [...(groups.get(link.label) ?? []), link]);
    }
    return [...groups.entries()];
  }, [links, asOf]);

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
                  const span = dates.span(link.validFromDay, link.validToDay);
                  const setDate = (patch: {
                    validFromDay?: number | null;
                    validToDay?: number | null;
                  }) =>
                    updateLink.mutate(
                      { id: link.id, ...patch },
                      { onError: (error) => toast.error(errorMessage(error)) },
                    );
                  return (
                    <div key={link.id} className="group space-y-1 text-sm">
                      <div className="flex items-center gap-2">
                        <EntityIcon icon={type?.icon ?? 'file-text'} color={type?.color} />
                        <Link
                          to={`${base}/e/${link.other.id}`}
                          className="truncate hover:underline"
                        >
                          {link.other.name}
                        </Link>
                        {canEdit ? (
                          <button
                            type="button"
                            aria-label={`Set when the link to ${link.other.name} holds`}
                            aria-expanded={periodFor === link.id}
                            className="ml-auto text-muted-foreground opacity-0 transition-opacity hover:text-foreground focus:opacity-100 group-hover:opacity-100"
                            onClick={() => setPeriodFor(periodFor === link.id ? null : link.id)}
                          >
                            <CalendarClock className="size-3.5" />
                          </button>
                        ) : null}
                        {canEdit ? (
                          <button
                            type="button"
                            aria-label={`Remove link to ${link.other.name}`}
                            className="text-muted-foreground opacity-0 transition-opacity hover:text-destructive focus:opacity-100 group-hover:opacity-100"
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
                      {span ? <p className="pl-6 text-xs text-muted-foreground">{span}</p> : null}
                      {periodFor === link.id ? (
                        <div className="ml-6 space-y-2 rounded-md border bg-card p-2">
                          <p className="text-xs text-muted-foreground">
                            When does this hold? Leave a side empty if it has no limit.
                          </p>
                          <div className="space-y-1">
                            <Label>From</Label>
                            <DateField
                              label="From"
                              value={link.validFromDay}
                              onChange={(day) => setDate({ validFromDay: day })}
                            />
                          </div>
                          <div className="space-y-1">
                            <Label>Until</Label>
                            <DateField
                              label="Until"
                              value={link.validToDay}
                              onChange={(day) => setDate({ validToDay: day })}
                            />
                          </div>
                        </div>
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
