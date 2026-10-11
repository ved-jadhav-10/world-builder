import { ArrowDown, ArrowUp, Plus, Trash2, X } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { toast } from 'sonner';
import {
  FIELD_TYPE_LABELS,
  FIELD_TYPES,
  fieldSchemaSchema,
  slugify,
  type EntityType,
  type FieldDefinition,
  type FieldType,
} from '@atlas/shared';
import { errorMessage } from '@/api/client';
import {
  useCreateEntityType,
  useCreateRelationshipType,
  useDeleteEntityType,
  useDeleteRelationshipType,
  useRelationshipTypes,
  useUpdateEntityType,
} from '@/api/queries';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { EntityIcon } from '@/components/entity-icon';
import { ENTITY_ICONS } from '@/lib/entity-icons';
import { Button } from '@/components/ui/button';
import { Input, Label, NativeSelect } from '@/components/ui/inputs';
import { Badge } from '@/components/ui/misc';
import { cn } from '@/lib/utils';
import { useWorld } from '@/lib/world-context';

const COLORS = [
  '#e11d48',
  '#ea580c',
  '#d97706',
  '#65a30d',
  '#059669',
  '#0891b2',
  '#2563eb',
  '#7c3aed',
  '#c026d3',
  '#475569',
];

interface FieldDraft {
  /** Existing fields keep their key so stored values stay attached. */
  key: string | null;
  label: string;
  type: FieldType;
  options: string;
}

const toDraft = (field: FieldDefinition): FieldDraft => ({
  key: field.key,
  label: field.label,
  type: field.type,
  options: field.options?.join(', ') ?? '',
});

/** Turns drafts into a field schema; new fields get keys derived from their labels. */
function buildFieldSchema(drafts: FieldDraft[]): FieldDefinition[] {
  const taken = new Set(drafts.flatMap((d) => (d.key ? [d.key] : [])));
  return drafts.map((draft) => {
    let key = draft.key;
    if (!key) {
      const base = slugify(draft.label, '_', 40) || 'field';
      key = /^[a-z]/.test(base) ? base : `field_${base}`;
      for (let n = 2; taken.has(key); n++) key = `${base}_${n}`;
      taken.add(key);
    }
    const needsOptions = draft.type === 'select' || draft.type === 'multi_select';
    const options = draft.options
      .split(',')
      .map((o) => o.trim())
      .filter(Boolean);
    return {
      key,
      label: draft.label.trim(),
      type: draft.type,
      ...(needsOptions ? { options } : {}),
    };
  });
}

function TypeEditor({
  type,
  onDone,
}: {
  type: EntityType | null;
  onDone: (typeId?: string) => void;
}) {
  const { world } = useWorld();
  const createType = useCreateEntityType(world.id);
  const updateType = useUpdateEntityType(world.id);
  const deleteType = useDeleteEntityType(world.id);
  const [name, setName] = useState(type?.name ?? '');
  const [icon, setIcon] = useState(type?.icon ?? 'file-text');
  const [color, setColor] = useState(type?.color ?? '#475569');
  const [fields, setFields] = useState<FieldDraft[]>(type?.fieldSchema.map(toDraft) ?? []);
  const busy = createType.isPending || updateType.isPending;

  const patchField = (index: number, patch: Partial<FieldDraft>) =>
    setFields((all) => all.map((f, i) => (i === index ? { ...f, ...patch } : f)));
  const moveField = (index: number, delta: number) =>
    setFields((all) => {
      const next = [...all];
      const [moved] = next.splice(index, 1);
      next.splice(index + delta, 0, moved!);
      return next;
    });

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    const fieldSchema = buildFieldSchema(fields);
    const check = fieldSchemaSchema.safeParse(fieldSchema);
    if (!check.success) {
      const issue = check.error.issues[0];
      const fieldIndex = typeof issue?.path[0] === 'number' ? issue.path[0] : undefined;
      const where = fieldIndex !== undefined ? `Field ${fieldIndex + 1}: ` : '';
      return toast.error(`${where}${issue?.message ?? 'Check the fields'}`);
    }
    try {
      const saved = type
        ? await updateType.mutateAsync({ id: type.id, name, icon, color, fieldSchema })
        : await createType.mutateAsync({ name, icon, color, fieldSchema });
      toast.success(type ? 'Type saved' : `${saved.name} created`);
      onDone(saved.id);
    } catch (error) {
      toast.error(errorMessage(error));
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-6 rounded-xl border bg-card p-5">
      <div className="flex items-center justify-between gap-2">
        <h2 className="font-serif text-xl font-semibold">
          {type ? `Edit ${type.name}` : 'New type'}
        </h2>
        {type?.isBuiltin ? <Badge>Built-in</Badge> : null}
      </div>

      <div className="grid gap-4 sm:grid-cols-[1fr_auto]">
        <div className="space-y-1.5">
          <Label htmlFor="type-name">Name</Label>
          <Input
            id="type-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            maxLength={60}
          />
        </div>
        <div className="space-y-1.5">
          <Label>Colour</Label>
          <div className="flex flex-wrap items-center gap-1.5">
            {COLORS.map((c) => (
              <button
                key={c}
                type="button"
                aria-label={`Colour ${c}`}
                onClick={() => setColor(c)}
                className={cn(
                  'size-6 rounded-full border-2',
                  color === c ? 'border-foreground' : 'border-transparent',
                )}
                style={{ backgroundColor: c }}
              />
            ))}
          </div>
        </div>
      </div>

      <div className="space-y-1.5">
        <Label>Icon</Label>
        <div className="flex flex-wrap gap-1">
          {Object.keys(ENTITY_ICONS).map((name) => (
            <button
              key={name}
              type="button"
              title={name}
              aria-label={`Icon ${name}`}
              aria-pressed={icon === name}
              onClick={() => setIcon(name)}
              className={cn(
                'flex size-8 items-center justify-center rounded-md border transition-colors hover:bg-muted',
                icon === name ? 'border-primary bg-accent' : 'border-transparent',
              )}
            >
              <EntityIcon icon={name} color={icon === name ? color : undefined} />
            </button>
          ))}
        </div>
      </div>

      <div className="space-y-2">
        <Label>Fields</Label>
        {fields.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No fields yet. Every entry still gets a name, summary and notes.
          </p>
        ) : null}
        <ul className="space-y-2">
          {fields.map((field, index) => (
            <li key={index} className="rounded-lg border bg-background p-3">
              <div className="flex flex-wrap items-center gap-2">
                <Input
                  aria-label="Field label"
                  className="min-w-40 flex-1"
                  value={field.label}
                  onChange={(e) => patchField(index, { label: e.target.value })}
                  placeholder="Label, e.g. Birthplace"
                  required
                  maxLength={80}
                />
                <NativeSelect
                  aria-label="Field type"
                  className="w-auto"
                  value={field.type}
                  onChange={(e) => patchField(index, { type: e.target.value as FieldType })}
                >
                  {FIELD_TYPES.map((t) => (
                    <option key={t} value={t}>
                      {FIELD_TYPE_LABELS[t]}
                    </option>
                  ))}
                </NativeSelect>
                <div className="flex">
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    disabled={index === 0}
                    onClick={() => moveField(index, -1)}
                    aria-label="Move up"
                  >
                    <ArrowUp />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    disabled={index === fields.length - 1}
                    onClick={() => moveField(index, 1)}
                    aria-label="Move down"
                  >
                    <ArrowDown />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    onClick={() => setFields((all) => all.filter((_, i) => i !== index))}
                    aria-label="Remove field"
                  >
                    <X />
                  </Button>
                </div>
              </div>
              {field.type === 'select' || field.type === 'multi_select' ? (
                <Input
                  aria-label="Options"
                  className="mt-2"
                  value={field.options}
                  onChange={(e) => patchField(index, { options: e.target.value })}
                  placeholder="Options, separated by commas"
                />
              ) : null}
            </li>
          ))}
        </ul>
        <Button
          variant="outline"
          size="sm"
          onClick={() =>
            setFields((all) => [...all, { key: null, label: '', type: 'text', options: '' }])
          }
        >
          <Plus /> Add field
        </Button>
        {type ? (
          <p className="text-xs text-muted-foreground">
            Removing a field hides its values; they're cleared the next time each entry is saved.
          </p>
        ) : null}
      </div>

      <div className="flex flex-wrap items-center gap-2 border-t pt-4">
        <Button type="submit" disabled={busy || !name.trim()}>
          {type ? 'Save type' : 'Create type'}
        </Button>
        <Button variant="ghost" onClick={() => onDone(type?.id)}>
          Cancel
        </Button>
        {type ? (
          <ConfirmDialog
            title={`Delete the ${type.name} type?`}
            description="Only possible when no entries (including ones in Trash) use it."
            onConfirm={async () => {
              try {
                await deleteType.mutateAsync(type.id);
                toast.success(`${type.name} deleted`);
                onDone();
              } catch (error) {
                toast.error(errorMessage(error));
              }
            }}
            trigger={
              <Button variant="ghost" className="ml-auto text-destructive">
                <Trash2 /> Delete type
              </Button>
            }
          />
        ) : null}
      </div>
    </form>
  );
}

function RelationshipTypesSection() {
  const { world } = useWorld();
  const { data: relTypes = [] } = useRelationshipTypes(world.id);
  const createRelType = useCreateRelationshipType(world.id);
  const deleteRelType = useDeleteRelationshipType(world.id);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    try {
      await createRelType.mutateAsync({
        label: String(form.get('label')),
        inverseLabel: String(form.get('inverseLabel')),
      });
      formElement.reset();
    } catch (error) {
      toast.error(errorMessage(error));
    }
  }

  return (
    <section className="space-y-4">
      <div>
        <h2 className="font-serif text-xl font-semibold">Relationship types</h2>
        <p className="text-sm text-muted-foreground">
          Each link reads one way from each side: Mira is <em>located in</em> the Eel; the Eel{' '}
          <em>contains</em> Mira.
        </p>
      </div>
      <ul className="divide-y rounded-xl border bg-card">
        {relTypes.map((t) => (
          <li key={t.id} className="flex items-center gap-3 px-4 py-2 text-sm">
            <span className="font-medium">{t.label}</span>
            <span className="text-muted-foreground">↔ {t.inverseLabel}</span>
            {t.isBuiltin ? null : (
              <Button
                variant="ghost"
                size="icon-sm"
                className="ml-auto"
                aria-label={`Delete ${t.label}`}
                onClick={() =>
                  deleteRelType.mutate(t.id, {
                    onError: (error) => toast.error(errorMessage(error)),
                  })
                }
              >
                <X />
              </Button>
            )}
          </li>
        ))}
      </ul>
      <form onSubmit={onSubmit} className="flex flex-wrap items-end gap-2">
        <div className="space-y-1.5">
          <Label htmlFor="rel-label">Label</Label>
          <Input id="rel-label" name="label" placeholder="mentor of" required maxLength={60} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="rel-inverse">Reads back as</Label>
          <Input
            id="rel-inverse"
            name="inverseLabel"
            placeholder="apprentice of"
            required
            maxLength={60}
          />
        </div>
        <Button type="submit" variant="outline" disabled={createRelType.isPending}>
          <Plus /> Add
        </Button>
      </form>
    </section>
  );
}

export function TypesSettingsPage() {
  const { types } = useWorld();
  const [selectedId, setSelectedId] = useState<string | 'new' | null>(null);
  const selected =
    selectedId && selectedId !== 'new' ? types.find((t) => t.id === selectedId) : undefined;

  return (
    <div className="space-y-12">
      <div>
        <h1 className="font-serif text-2xl font-semibold">Types</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Shape what each kind of entry records. Built-in types can be edited too.
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-[240px_minmax(0,1fr)]">
        <div className="space-y-1">
          {types.map((type) => (
            <button
              key={type.id}
              type="button"
              onClick={() => setSelectedId(type.id)}
              className={cn(
                'flex w-full items-center gap-2.5 rounded-md px-3 py-2 text-left text-sm hover:bg-muted',
                selectedId === type.id && 'bg-accent text-accent-foreground',
              )}
            >
              <EntityIcon icon={type.icon} color={type.color} />
              <span className="truncate">{type.name}</span>
              <span className="ml-auto text-xs text-muted-foreground">
                {type.fieldSchema.length} {type.fieldSchema.length === 1 ? 'field' : 'fields'}
              </span>
            </button>
          ))}
          <Button
            variant="outline"
            size="sm"
            className="mt-2 w-full"
            onClick={() => setSelectedId('new')}
          >
            <Plus /> New type
          </Button>
        </div>
        <div>
          {selectedId === 'new' || selected ? (
            <TypeEditor
              key={selectedId}
              type={selected ?? null}
              onDone={(typeId) => setSelectedId(typeId ?? null)}
            />
          ) : (
            <p className="rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">
              Pick a type to edit its fields, or create a new one.
            </p>
          )}
        </div>
      </div>

      <RelationshipTypesSection />
    </div>
  );
}

export { TypesSettingsPage as Component };
