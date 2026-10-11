import { Clock, TriangleAlert, X } from 'lucide-react';
import { applyProgressions, type Entity, type EntityType } from '@atlas/shared';
import { useProgressions } from '@/api/timeline-queries';
import { FieldRenderer } from '@/components/field-renderer';
import { RelationshipsPanel } from '@/components/relationships-panel';
import { Badge, Spinner } from '@/components/ui/misc';
import { Button } from '@/components/ui/button';
import { useAnchorLabel, useScenes, useStoryPoint, type AsOf } from '@/lib/as-of';
import { describeChanges } from '@/lib/progression-text';
import { useDates } from '@/lib/use-dates';
import { useWorld } from '@/lib/world-context';

/** A read-only view of an entry at a point in the story: changes up to then applied. */
export function EntityAsOfView({
  entity,
  type,
  asOf,
  onExit,
}: {
  entity: Entity;
  type: EntityType;
  asOf: AsOf;
  onExit: () => void;
}) {
  const { world } = useWorld();
  const { index, options } = useScenes();
  const dates = useDates();
  const anchorLabel = useAnchorLabel();
  const { point, missing } = useStoryPoint(asOf);
  const { data: progressions, isPending } = useProgressions(world.id, entity.id);

  const where =
    asOf.kind === 'scene'
      ? (options.find((o) => o.id === asOf.sceneId)?.label ?? 'a deleted scene')
      : dates.date(asOf.day);

  const banner = (
    <div className="flex flex-wrap items-center gap-2 rounded-lg border border-primary/30 bg-accent px-4 py-3 text-sm text-accent-foreground">
      <Clock className="size-4 shrink-0" />
      <span>
        Showing {entity.name} as of <strong>{where}</strong>. This is a read-only view.
      </span>
      <Button type="button" size="sm" variant="outline" className="ml-auto" onClick={onExit}>
        <X /> Back to the latest
      </Button>
    </div>
  );

  if (missing || !point) {
    return (
      <div className="space-y-4">
        {banner}
        <p className="flex items-center gap-2 text-sm text-destructive">
          <TriangleAlert className="size-4" /> That scene no longer exists. Choose another point in
          the story.
        </p>
      </div>
    );
  }
  if (isPending || !progressions) return <Spinner />;

  const resolved = applyProgressions(
    { fields: entity.fields, summary: entity.summary },
    progressions,
    point,
    index,
  );
  const changed = (key: string) =>
    JSON.stringify(resolved.fields[key] ?? null) !== JSON.stringify(entity.fields[key] ?? null);

  // Where this moment falls against the entry's own life span, when the moment has a date.
  let lifeStatus: string | null = null;
  if (point.day !== null) {
    if (entity.startDay !== null && point.day < entity.startDay) {
      lifeStatus = `Before “${type.startLabel}” (${dates.date(entity.startDay)})`;
    } else if (entity.endDay !== null && point.day > entity.endDay) {
      lifeStatus = `After “${type.endLabel}” (${dates.date(entity.endDay)})`;
    }
  }

  return (
    <div className="space-y-6">
      {banner}
      <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_300px]">
        <div className="space-y-6">
          {lifeStatus ? (
            <Badge className="border-amber-500/40 text-amber-700 dark:text-amber-300">
              {lifeStatus}
            </Badge>
          ) : null}
          <div className="space-y-1.5">
            <h2 className="text-sm font-semibold">
              Summary{' '}
              {resolved.summary !== entity.summary ? (
                <Badge className="ml-1 align-middle">changed</Badge>
              ) : null}
            </h2>
            <p className="whitespace-pre-wrap">
              {resolved.summary || (
                <span className="text-muted-foreground">No summary at this point.</span>
              )}
            </p>
          </div>

          <section className="space-y-3">
            <h2 className="text-sm font-semibold">Changes by then ({resolved.applied.length})</h2>
            {resolved.applied.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Nothing has changed yet: this is how the entry started.
              </p>
            ) : (
              <ol className="space-y-2">
                {resolved.applied.map((progression) => {
                  const lines = describeChanges(type, progression.changes);
                  return (
                    <li key={progression.id} className="rounded-lg border bg-card p-3 text-sm">
                      <p className="font-medium">{progression.title}</p>
                      <p className="text-xs text-muted-foreground">{anchorLabel(progression)}</p>
                      {lines.length > 0 ? (
                        <ul className="mt-1.5 list-disc space-y-0.5 pl-4 text-[13px]">
                          {lines.map((line) => (
                            <li key={line}>{line}</li>
                          ))}
                        </ul>
                      ) : null}
                      {progression.note ? (
                        <p className="mt-1.5 whitespace-pre-wrap text-[13px] text-muted-foreground">
                          {progression.note}
                        </p>
                      ) : null}
                    </li>
                  );
                })}
              </ol>
            )}
            {resolved.later.length > 0 ? (
              <p className="text-sm text-muted-foreground">
                {resolved.later.length} more{' '}
                {resolved.later.length === 1 ? 'change comes' : 'changes come'} later in the story.
              </p>
            ) : null}
            {resolved.unplaced.length > 0 ? (
              <p className="flex items-start gap-2 text-sm text-muted-foreground">
                <TriangleAlert className="mt-0.5 size-4 shrink-0" />
                <span>
                  {resolved.unplaced.length} {resolved.unplaced.length === 1 ? 'change' : 'changes'}{' '}
                  could not be placed here: {resolved.unplaced.map((p) => p.title).join(', ')}.{' '}
                  {point.day === null
                    ? 'This scene has no date, so changes set on a date can’t be compared with it.'
                    : 'Their scene has no date, or was deleted.'}
                </span>
              </p>
            ) : null}
          </section>
        </div>

        <aside className="space-y-8">
          <section className="space-y-4">
            <h2 className="text-sm font-semibold">Details</h2>
            {type.fieldSchema.map((def) => (
              <div key={def.key} className="space-y-1.5">
                <div className="text-[13px] font-medium text-muted-foreground">
                  {def.label} {changed(def.key) ? <Badge className="ml-1">changed</Badge> : null}
                </div>
                <FieldRenderer
                  id={`as-of-${def.key}`}
                  field={def}
                  value={resolved.fields[def.key] ?? null}
                  onChange={() => {}}
                  disabled
                />
              </div>
            ))}
          </section>
          <RelationshipsPanel entity={entity} asOf={point} readOnly />
        </aside>
      </div>
    </div>
  );
}
