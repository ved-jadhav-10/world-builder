import { Link2, Spline } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router';
import { arcColumns, buildArc, type ArcGranularity } from '@atlas/shared';
import { useEntity, useEntityRelationships, useRelationshipTypes } from '@/api/queries';
import { useWorldProgressions } from '@/api/timeline-queries';
import { EntityIcon } from '@/components/entity-icon';
import { EntityPicker } from '@/components/entity-picker';
import { Button } from '@/components/ui/button';
import { NativeSelect } from '@/components/ui/inputs';
import { EmptyState, PageSpinner } from '@/components/ui/misc';
import { useManuscriptTree } from '@/lib/manuscript-tree';
import { cn } from '@/lib/utils';
import { useWorld } from '@/lib/world-context';

/** The table for one chosen entry. It only mounts once an entry is picked. */
function ArcTable({ entityId, granularity }: { entityId: string; granularity: ArcGranularity }) {
  const { world, typeById } = useWorld();
  const { data: entity } = useEntity(world.id, entityId);
  const { data: links } = useEntityRelationships(world.id, entityId);
  const { data: relTypes } = useRelationshipTypes(world.id);
  const { data: progressions } = useWorldProgressions(world.id);
  const { tree, isPending: treePending } = useManuscriptTree();
  const [onlyMoving, setOnlyMoving] = useState(true);

  const arc = useMemo(() => {
    if (!entity || !links || !relTypes || !progressions) return null;
    const { columns, scenes } = arcColumns(tree.nodes, granularity);
    const type = typeById.get(entity.typeId);
    const rows = buildArc({
      entry: {
        name: entity.name,
        aliases: entity.aliases,
        summary: entity.summary,
        fields: entity.fields,
      },
      fieldDefs: type?.fieldSchema ?? [],
      links: links.map((l) => ({ id: l.id, label: `${l.label} ${l.other.name}` })),
      typeLabels: new Map(relTypes.map((t) => [t.id, t.label])),
      progressions: progressions.filter((p) => p.entityId === entityId),
      columns,
      scenes,
    });
    return { columns, rows };
  }, [entity, links, relTypes, progressions, tree, granularity, typeById, entityId]);

  if (!entity || !arc || treePending) return <PageSpinner />;
  if (arc.columns.length === 0) {
    return (
      <EmptyState icon={<Spline />} title="No scenes yet">
        The arc is read at the end of each chapter, so it needs a manuscript with scenes.
      </EmptyState>
    );
  }
  const rows = onlyMoving ? arc.rows.filter((r) => r.moves) : arc.rows;

  return (
    <div className="space-y-3">
      <label className="flex items-center gap-1.5 text-sm">
        <input
          type="checkbox"
          checked={onlyMoving}
          onChange={(event) => setOnlyMoving(event.target.checked)}
        />
        Only what changes
      </label>
      {rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Nothing about {entity.name} changes yet. Add changes on the entry’s page, under “Changes
          over time”, anchored to scenes.
        </p>
      ) : (
        <div className="overflow-x-auto rounded-xl border">
          <table className="w-full min-w-max border-collapse text-sm">
            <thead>
              <tr className="border-b bg-muted/50 text-left">
                <th className="sticky left-0 z-10 bg-muted px-3 py-2 font-medium">&nbsp;</th>
                {arc.columns.map((column) => (
                  <th key={column.id} scope="col" className="px-3 py-2 font-medium">
                    {column.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.key} className="border-b last:border-0">
                  <th
                    scope="row"
                    className="sticky left-0 z-10 max-w-48 bg-card px-3 py-2 text-left font-medium"
                  >
                    {row.label}
                  </th>
                  {row.cells.map((cell, i) => (
                    <td
                      key={arc.columns[i]!.id}
                      className={cn(
                        'max-w-56 px-3 py-2 align-top',
                        row.changed[i]
                          ? 'bg-accent font-medium text-accent-foreground'
                          : 'text-muted-foreground',
                      )}
                    >
                      {cell}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="text-xs text-muted-foreground">
        Each column is how things stand at the end of that {granularity}. Highlighted cells are
        where something changes. Only changes placed at a scene are read here.
      </p>
    </div>
  );
}

function ArcPage() {
  const { world, typeById } = useWorld();
  const [params, setParams] = useSearchParams();
  const entityId = params.get('e');
  const granularity: ArcGranularity = params.get('by') === 'scene' ? 'scene' : 'chapter';
  const { data: entity } = useEntity(world.id, entityId ?? '');
  const type = entity ? typeById.get(entity.typeId) : undefined;

  const set = (patch: Record<string, string | null>) => {
    const next = new URLSearchParams(params);
    for (const [key, value] of Object.entries(patch)) {
      if (value === null) next.delete(key);
      else next.set(key, value);
    }
    setParams(next, { replace: true });
  };

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div>
        <p className="text-sm font-medium text-muted-foreground">Writing</p>
        <h1 className="font-serif text-3xl font-semibold">Arc tracker</h1>
        <p className="mt-1 text-muted-foreground">
          How a character, place or faction changes across your chapters: their name, details and
          relationships, read from the changes you have recorded.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <EntityPicker
          onSelect={(picked) => set({ e: picked.id })}
          trigger={
            <Button type="button" variant="outline">
              {entity && type ? <EntityIcon icon={type.icon} color={type.color} /> : <Link2 />}
              {entity ? entity.name : 'Choose an entry'}
            </Button>
          }
        />
        <NativeSelect
          aria-label="Read at the end of each"
          className="w-auto"
          value={granularity}
          onChange={(event) => set({ by: event.target.value === 'scene' ? 'scene' : null })}
        >
          <option value="chapter">By chapter</option>
          <option value="scene">By scene</option>
        </NativeSelect>
      </div>

      {entityId ? (
        <ArcTable key={entityId} entityId={entityId} granularity={granularity} />
      ) : (
        <EmptyState icon={<Spline />} title="Pick someone to follow">
          Choose an entry to see its arc, one column for each chapter.
        </EmptyState>
      )}
    </div>
  );
}

export { ArcPage as Component };
