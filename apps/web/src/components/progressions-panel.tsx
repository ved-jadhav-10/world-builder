import { History, Pencil, Plus, Trash2, TriangleAlert } from 'lucide-react';
import { useState, type FormEvent, type ReactNode } from 'react';
import { toast } from 'sonner';
import {
  sortProgressions,
  type Entity,
  type EntityType,
  type Progression,
  type ProgressionChanges,
} from '@atlas/shared';
import { errorMessage } from '@/api/client';
import {
  useCreateProgression,
  useDeleteProgression,
  useProgressions,
  useUpdateProgression,
} from '@/api/timeline-queries';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { DateField } from '@/components/date-field';
import { FieldRenderer } from '@/components/field-renderer';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogFooter, DialogTrigger } from '@/components/ui/dialog';
import { Input, Label, NativeSelect, Textarea } from '@/components/ui/inputs';
import { Spinner } from '@/components/ui/misc';
import { useAnchorLabel, useScenes } from '@/lib/as-of';
import { describeChanges } from '@/lib/progression-text';
import { useWorld } from '@/lib/world-context';

/** The form inside the dialog. It only exists while the dialog is open, so it starts fresh each time. */
function ProgressionForm({
  entity,
  type,
  existing,
  onDone,
}: {
  entity: Entity;
  type: EntityType;
  existing?: Progression;
  onDone: () => void;
}) {
  const { world } = useWorld();
  const { options: scenes } = useScenes();
  const create = useCreateProgression(world.id, entity.id);
  const update = useUpdateProgression(world.id, entity.id);

  const startsAtScene = existing ? existing.sceneId !== null : scenes.length > 0;
  const [title, setTitle] = useState(existing?.title ?? '');
  const [note, setNote] = useState(existing?.note ?? '');
  const [anchor, setAnchor] = useState<'scene' | 'day'>(startsAtScene ? 'scene' : 'day');
  const [sceneId, setSceneId] = useState(existing?.sceneId ?? '');
  const [day, setDay] = useState<number | null>(existing?.day ?? null);
  const [fields, setFields] = useState<Record<string, unknown>>(existing?.changes.fields ?? {});
  const [summaryOn, setSummaryOn] = useState(existing?.changes.summary !== undefined);
  const [summary, setSummary] = useState(existing?.changes.summary ?? entity.summary);

  const unused = type.fieldSchema.filter((f) => !(f.key in fields));
  const placed = anchor === 'scene' ? sceneId !== '' : day !== null;
  const busy = create.isPending || update.isPending;

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    const changes: ProgressionChanges = {
      ...(Object.keys(fields).length > 0 ? { fields } : {}),
      ...(summaryOn ? { summary } : {}),
    };
    const payload = {
      title,
      note,
      sceneId: anchor === 'scene' ? sceneId : null,
      day: anchor === 'day' ? day : null,
      changes,
    };
    try {
      if (existing) await update.mutateAsync({ id: existing.id, ...payload });
      else await create.mutateAsync(payload);
      onDone();
    } catch (error) {
      toast.error(errorMessage(error));
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-5">
      <div className="space-y-1.5">
        <Label htmlFor="progression-title">What happens</Label>
        <Input
          id="progression-title"
          required
          maxLength={120}
          autoFocus
          placeholder="Loses her left hand"
          value={title}
          onChange={(event) => setTitle(event.target.value)}
        />
      </div>

      <fieldset className="space-y-2">
        <legend className="text-[13px] font-medium text-muted-foreground">When</legend>
        <div className="flex gap-4 text-sm">
          <label className="flex items-center gap-1.5">
            <input
              type="radio"
              name="anchor"
              checked={anchor === 'scene'}
              disabled={scenes.length === 0}
              onChange={() => setAnchor('scene')}
            />
            At a scene
          </label>
          <label className="flex items-center gap-1.5">
            <input
              type="radio"
              name="anchor"
              checked={anchor === 'day'}
              onChange={() => setAnchor('day')}
            />
            On a date
          </label>
        </div>
        {anchor === 'scene' ? (
          <NativeSelect
            aria-label="Scene"
            value={sceneId}
            onChange={(event) => setSceneId(event.target.value)}
          >
            <option value="">Choose a scene…</option>
            {scenes.map((scene) => (
              <option key={scene.id} value={scene.id}>
                {scene.label}
              </option>
            ))}
          </NativeSelect>
        ) : (
          <DateField label="Date" value={day} onChange={setDay} />
        )}
      </fieldset>

      <div className="space-y-2">
        <Label>What changes</Label>
        {Object.keys(fields).map((key) => {
          const def = type.fieldSchema.find((f) => f.key === key);
          if (!def) return null;
          return (
            <div key={key} className="space-y-1">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">{def.label}</span>
                <button
                  type="button"
                  className="text-xs text-muted-foreground hover:text-destructive"
                  onClick={() =>
                    setFields(Object.fromEntries(Object.entries(fields).filter(([k]) => k !== key)))
                  }
                >
                  Remove
                </button>
              </div>
              <FieldRenderer
                id={`progression-field-${key}`}
                field={def}
                value={fields[key]}
                onChange={(value) => setFields({ ...fields, [key]: value })}
              />
            </div>
          );
        })}
        {Object.keys(fields).length > 0 ? (
          <p className="text-xs text-muted-foreground">Leave a field empty to clear it.</p>
        ) : null}
        {unused.length > 0 ? (
          <NativeSelect
            aria-label="Add a field change"
            value=""
            onChange={(event) => {
              const def = type.fieldSchema.find((f) => f.key === event.target.value);
              if (!def) return;
              setFields({
                ...fields,
                [def.key]: def.type === 'boolean' ? false : def.type === 'multi_select' ? [] : '',
              });
            }}
          >
            <option value="">Change a detail…</option>
            {unused.map((f) => (
              <option key={f.key} value={f.key}>
                {f.label}
              </option>
            ))}
          </NativeSelect>
        ) : null}
        <label className="flex items-center gap-1.5 text-sm">
          <input
            type="checkbox"
            checked={summaryOn}
            onChange={(event) => setSummaryOn(event.target.checked)}
          />
          Change the summary
        </label>
        {summaryOn ? (
          <Textarea
            aria-label="New summary"
            rows={2}
            maxLength={2000}
            value={summary}
            onChange={(event) => setSummary(event.target.value)}
          />
        ) : null}
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="progression-note">Note</Label>
        <Textarea
          id="progression-note"
          maxLength={5000}
          placeholder="Anything worth remembering about this change."
          value={note}
          onChange={(event) => setNote(event.target.value)}
        />
      </div>

      <DialogFooter className="mt-0">
        <Button type="submit" disabled={busy || !title.trim() || !placed}>
          {existing ? 'Save' : 'Add change'}
        </Button>
      </DialogFooter>
    </form>
  );
}

function ProgressionDialog({
  entity,
  type,
  existing,
  trigger,
}: {
  entity: Entity;
  type: EntityType;
  existing?: Progression;
  trigger: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent
        className="max-h-[85dvh] max-w-xl overflow-y-auto"
        title={existing ? 'Edit change' : `A change to ${entity.name}`}
        description="Something that becomes true at a point in the story, and stays true after it."
      >
        <ProgressionForm
          entity={entity}
          type={type}
          existing={existing}
          onDone={() => setOpen(false)}
        />
      </DialogContent>
    </Dialog>
  );
}

/** The entry's history: what changes about it, and when in the story. */
export function ProgressionsPanel({ entity, type }: { entity: Entity; type: EntityType }) {
  const { world, canEdit } = useWorld();
  const { data: progressions, isPending } = useProgressions(world.id, entity.id);
  const { index } = useScenes();
  const anchorLabel = useAnchorLabel();
  const remove = useDeleteProgression(world.id, entity.id);
  const ordered = sortProgressions(progressions ?? [], index, true);

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 text-sm font-semibold">
          <History className="size-4 text-muted-foreground" /> Changes over time
        </h2>
        {canEdit ? (
          <ProgressionDialog
            entity={entity}
            type={type}
            trigger={
              <Button type="button" size="sm" variant="outline">
                <Plus /> Add change
              </Button>
            }
          />
        ) : null}
      </div>

      {isPending ? (
        <Spinner />
      ) : ordered.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Nothing changes yet. Add a change to record that {entity.name} becomes different at a
          scene or date, then view the entry “as of” any point in the story.
        </p>
      ) : (
        <ol className="space-y-2">
          {ordered.map((progression) => {
            const lines = describeChanges(type, progression.changes);
            const unplaced = !progression.sceneId && progression.day === null;
            return (
              <li key={progression.id} className="group rounded-lg border bg-card p-3 text-sm">
                <div className="flex items-start gap-2">
                  <div className="min-w-0 flex-1">
                    <p className="font-medium">{progression.title}</p>
                    <p
                      className={
                        unplaced
                          ? 'flex items-center gap-1 text-xs text-destructive'
                          : 'text-xs text-muted-foreground'
                      }
                    >
                      {unplaced ? <TriangleAlert className="size-3" /> : null}
                      {unplaced
                        ? 'Its scene was deleted. Edit it to give it a new place.'
                        : anchorLabel(progression)}
                    </p>
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
                  </div>
                  {canEdit ? (
                    <div className="flex shrink-0 gap-0.5 opacity-0 transition-opacity focus-within:opacity-100 group-hover:opacity-100">
                      <ProgressionDialog
                        entity={entity}
                        type={type}
                        existing={progression}
                        trigger={
                          <Button type="button" variant="ghost" size="icon-sm">
                            <Pencil />
                            <span className="sr-only">Edit {progression.title}</span>
                          </Button>
                        }
                      />
                      <ConfirmDialog
                        title="Delete this change?"
                        description={`“${progression.title}” is removed from ${entity.name}'s history.`}
                        onConfirm={() =>
                          remove
                            .mutateAsync(progression.id)
                            .catch((error: unknown) => toast.error(errorMessage(error)))
                        }
                        trigger={
                          <Button type="button" variant="ghost" size="icon-sm">
                            <Trash2 />
                            <span className="sr-only">Delete {progression.title}</span>
                          </Button>
                        }
                      />
                    </div>
                  ) : null}
                </div>
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}
