import { zodResolver } from '@hookform/resolvers/zod';
import { Save, Trash2 } from 'lucide-react';
import { useEffect, useEffectEvent, useMemo, useRef } from 'react';
import { Controller, useForm, type Resolver } from 'react-hook-form';
import { Link, useBlocker, useNavigate, useParams, useSearchParams } from 'react-router';
import { toast } from 'sonner';
import { z } from 'zod';
import {
  buildFieldValuesSchema,
  visibilitySchema,
  type Entity,
  type EntityType,
  type EntityUpdateInput,
  type RichTextDoc,
  type Visibility,
} from '@atlas/shared';
import { errorMessage } from '@/api/client';
import { useDeleteEntity, useEntity, useUpdateEntity } from '@/api/queries';
import { AliasesInput } from '@/components/aliases-input';
import { AsOfControl } from '@/components/as-of-control';
import { DateField } from '@/components/date-field';
import { EntityAsOfView } from '@/components/entity-as-of';
import { ProgressionsPanel } from '@/components/progressions-panel';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { EntityIcon } from '@/components/entity-icon';
import { EntityMaps } from '@/components/entity-maps';
import { FieldRenderer } from '@/components/field-renderer';
import { RelationshipsPanel } from '@/components/relationships-panel';
import { RichTextEditor } from '@/components/rich-text-editor';
import { TagsEditor } from '@/components/tags-editor';
import { AppearsIn } from '@/components/appears-in';
import { Button } from '@/components/ui/button';
import { FieldError, Label, NativeSelect, Textarea } from '@/components/ui/inputs';
import { EmptyState, PageSpinner } from '@/components/ui/misc';
import { formatAsOf, parseAsOf, type AsOf } from '@/lib/as-of';
import { timeAgo } from '@/lib/utils';
import { useWorld } from '@/lib/world-context';

const VISIBILITY_LABELS: Record<Visibility, string> = {
  gm: 'GM only',
  player: 'Players',
  reader: 'Readers',
  public: 'Public',
  hidden: 'Hidden',
};

interface FormValues {
  name: string;
  aliases: string[];
  summary: string;
  visibility: Visibility;
  fields: Record<string, unknown>;
  body: RichTextDoc | null;
  startDay: number | null;
  endDay: number | null;
}

/**
 * Every field in the type's schema gets a default (null when unset). Otherwise the form
 * registers missing keys on mount and immediately reports itself as dirty.
 */
const toFormValues = (entity: Entity, type: EntityType): FormValues => ({
  name: entity.name,
  aliases: entity.aliases,
  summary: entity.summary,
  visibility: entity.visibility,
  fields: Object.fromEntries(type.fieldSchema.map((f) => [f.key, entity.fields[f.key] ?? null])),
  body: entity.body,
  startDay: entity.startDay,
  endDay: entity.endDay,
});

const FALLBACK_TYPE: EntityType = {
  id: '',
  key: '',
  name: 'Entry',
  icon: 'file-text',
  color: '#64748b',
  fieldSchema: [],
  isBuiltin: false,
  sortOrder: 0,
  startLabel: 'Starts',
  endLabel: 'Ends',
  entityCount: 0,
};

export function EntityPage() {
  const { entityId = '' } = useParams();
  const { world } = useWorld();
  const query = useEntity(world.id, entityId);
  // "As of" lives in the link, so a view at a point in the story can be shared and revisited.
  const [searchParams, setSearchParams] = useSearchParams();
  const asOf = parseAsOf(searchParams.get('asOf'));
  const setAsOf = (next: AsOf | null) =>
    setSearchParams(
      (params) => {
        const copy = new URLSearchParams(params);
        if (next) copy.set('asOf', formatAsOf(next));
        else copy.delete('asOf');
        return copy;
      },
      { replace: true },
    );

  if (query.isPending) return <PageSpinner />;
  if (query.isError) {
    return (
      <EmptyState title="Entry not found">It may have been deleted or moved to Trash.</EmptyState>
    );
  }
  return (
    <EntityEditor key={query.data.id} entity={query.data} asOf={asOf} onAsOfChange={setAsOf} />
  );
}

function EntityEditor({
  entity,
  asOf,
  onAsOfChange,
}: {
  entity: Entity;
  asOf: AsOf | null;
  onAsOfChange: (value: AsOf | null) => void;
}) {
  const { world, typeById, base, canEdit } = useWorld();
  const type = typeById.get(entity.typeId) ?? FALLBACK_TYPE;
  const updateEntity = useUpdateEntity(world.id, entity.id);
  const deleteEntity = useDeleteEntity(world.id);
  const navigate = useNavigate();

  // Same rules the API enforces, so most mistakes show inline before saving.
  const schema = useMemo(
    () =>
      z
        .object({
          name: z.string().trim().min(1, 'Name is required').max(200),
          aliases: z.array(z.string()),
          summary: z.string().max(2000),
          visibility: visibilitySchema,
          fields: buildFieldValuesSchema(type.fieldSchema),
          body: z.unknown(),
          startDay: z.number().int().nullable(),
          endDay: z.number().int().nullable(),
        })
        .refine((v) => v.startDay === null || v.endDay === null || v.endDay >= v.startDay, {
          path: ['endDay'],
          message: 'The end cannot come before the start',
        }),
    [type.fieldSchema],
  );

  const form = useForm<FormValues>({
    defaultValues: toFormValues(entity, type),
    resolver: zodResolver(schema) as unknown as Resolver<FormValues>,
  });
  const { isDirty, isSubmitting, errors } = form.formState;

  const save = form.handleSubmit(async (values) => {
    try {
      const saved = await updateEntity.mutateAsync(values as EntityUpdateInput);
      form.reset(toFormValues(saved, type));
      toast.success('Saved');
    } catch (error) {
      toast.error(errorMessage(error));
    }
  });

  // Ctrl/Cmd+S saves.
  const onSaveShortcut = useEffectEvent(() => {
    if (canEdit) void save();
  });
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 's') {
        event.preventDefault();
        onSaveShortcut();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  // Don't lose unsaved edits to a stray click or tab close.
  const leavingRef = useRef(false);
  const blocker = useBlocker(
    ({ currentLocation, nextLocation }) =>
      isDirty && !leavingRef.current && currentLocation.pathname !== nextLocation.pathname,
  );
  useEffect(() => {
    if (blocker.state !== 'blocked') return;
    if (window.confirm('You have unsaved changes. Leave without saving?')) blocker.proceed();
    else blocker.reset();
  }, [blocker]);
  useEffect(() => {
    if (!isDirty) return;
    const onBeforeUnload = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [isDirty]);

  async function moveToTrash() {
    try {
      await deleteEntity.mutateAsync(entity.id);
      // Unsaved edits to a trashed entry aren't worth a prompt.
      leavingRef.current = true;
      toast.success(`${entity.name} moved to Trash`);
      void navigate(type.key ? `${base}/codex/${type.key}` : base);
    } catch (error) {
      toast.error(errorMessage(error));
    }
  }

  const fieldErrors = errors.fields as Record<string, { message?: string }> | undefined;

  return (
    <form onSubmit={save}>
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Link
          to={type.key ? `${base}/codex/${type.key}` : base}
          className="inline-flex items-center gap-1.5 hover:text-foreground"
        >
          <EntityIcon icon={type.icon} color={type.color} />
          {type.name}
        </Link>
        <span>·</span>
        <span>Updated {timeAgo(entity.updatedAt)}</span>
        <span className="ml-auto">
          <AsOfControl value={asOf} onChange={onAsOfChange} />
        </span>
      </div>

      {asOf ? (
        <div className="mt-4">
          <EntityAsOfView
            entity={entity}
            type={type}
            asOf={asOf}
            onExit={() => onAsOfChange(null)}
          />
        </div>
      ) : null}

      {/* The editor stays mounted while an "as of" view is open, so unsaved edits aren't lost. */}
      <div className={asOf ? 'hidden' : undefined}>
        <div className="mt-2 flex items-start gap-3">
          <input
            {...form.register('name')}
            aria-label="Name"
            aria-invalid={errors.name ? true : undefined}
            disabled={!canEdit}
            placeholder="Name"
            className="min-w-0 flex-1 bg-transparent font-serif text-3xl font-semibold tracking-tight outline-none placeholder:text-muted-foreground/50 sm:text-4xl"
          />
          {canEdit ? (
            <div className="flex shrink-0 items-center gap-1 pt-1">
              <Button type="submit" disabled={!isDirty || isSubmitting} title="Save (Ctrl+S)">
                <Save /> Save
              </Button>
              <ConfirmDialog
                title={`Move “${entity.name}” to Trash?`}
                description="It disappears from the Codex, search and relationships. You can restore it from Trash."
                confirmLabel="Move to Trash"
                onConfirm={moveToTrash}
                trigger={
                  <Button variant="ghost" size="icon" title="Move to Trash">
                    <Trash2 />
                    <span className="sr-only">Move to Trash</span>
                  </Button>
                }
              />
            </div>
          ) : null}
        </div>
        <FieldError message={errors.name?.message} />

        <div className="mt-3">
          <Controller
            control={form.control}
            name="aliases"
            render={({ field }) => (
              <AliasesInput value={field.value} onChange={field.onChange} disabled={!canEdit} />
            )}
          />
        </div>

        <div className="mt-8 grid gap-10 lg:grid-cols-[minmax(0,1fr)_300px]">
          <div className="space-y-6">
            <div className="space-y-1.5">
              <Label htmlFor="summary">Summary</Label>
              <Textarea
                id="summary"
                {...form.register('summary')}
                disabled={!canEdit}
                rows={2}
                maxLength={2000}
                placeholder="One or two lines that sum this up. Shown in lists and search."
              />
            </div>
            <div className="space-y-1.5">
              <Label>Notes</Label>
              <Controller
                control={form.control}
                name="body"
                render={({ field }) => (
                  <RichTextEditor
                    value={field.value}
                    onChange={field.onChange}
                    editable={canEdit}
                  />
                )}
              />
            </div>
            <ProgressionsPanel entity={entity} type={type} />
          </div>

          <aside className="space-y-8">
            <section className="space-y-4">
              <h2 className="text-sm font-semibold">Details</h2>
              {(
                [
                  ['startDay', type.startLabel],
                  ['endDay', type.endLabel],
                ] as const
              ).map(([name, label]) => (
                <div key={name} className="space-y-1.5">
                  <Label>{label}</Label>
                  <Controller
                    control={form.control}
                    name={name}
                    render={({ field }) => (
                      <DateField
                        label={label}
                        value={field.value}
                        onChange={field.onChange}
                        disabled={!canEdit}
                      />
                    )}
                  />
                  <FieldError message={errors[name]?.message} />
                </div>
              ))}
              {type.fieldSchema.map((fieldDef) => (
                <div key={fieldDef.key} className="space-y-1.5">
                  <Label htmlFor={`field-${fieldDef.key}`}>{fieldDef.label}</Label>
                  <Controller
                    control={form.control}
                    name={`fields.${fieldDef.key}`}
                    render={({ field }) => (
                      <FieldRenderer
                        id={`field-${fieldDef.key}`}
                        field={fieldDef}
                        value={field.value}
                        onChange={field.onChange}
                        disabled={!canEdit}
                        invalid={Boolean(fieldErrors?.[fieldDef.key])}
                      />
                    )}
                  />
                  <FieldError message={fieldErrors?.[fieldDef.key]?.message} />
                </div>
              ))}
              <div className="space-y-1.5">
                <Label htmlFor="visibility">Visibility</Label>
                <NativeSelect id="visibility" {...form.register('visibility')} disabled={!canEdit}>
                  {Object.entries(VISIBILITY_LABELS).map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </NativeSelect>
                <p className="text-xs text-muted-foreground">Takes effect once sharing arrives.</p>
              </div>
            </section>

            <RelationshipsPanel entity={entity} />
            <TagsEditor entity={entity} />
            <AppearsIn entityId={entity.id} />
            <EntityMaps entityId={entity.id} />
          </aside>
        </div>

        {canEdit && isDirty ? (
          <div className="pointer-events-none fixed inset-x-0 bottom-4 z-30 flex justify-center px-4">
            <div className="pointer-events-auto flex items-center gap-3 rounded-full border bg-card px-4 py-2 text-sm shadow-lg">
              <span className="text-muted-foreground">Unsaved changes</span>
              <Button type="submit" size="sm" disabled={isSubmitting}>
                Save <kbd className="text-[11px] opacity-70">Ctrl S</kbd>
              </Button>
            </div>
          </div>
        ) : null}
      </div>
    </form>
  );
}

export { EntityPage as Component };
