import { ExternalLink, Link2, Plus, Trash2, X } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { Link } from 'react-router';
import {
  FEATURE_KIND_LABELS,
  FEATURE_SIZES,
  LINE_STYLES,
  MAX_FEATURE_ZOOM,
  type AtlasMap,
  type FeatureUpdateInput,
  type MapFeature,
} from '@atlas/shared';
import { UploadMapDialog } from '@/components/atlas/upload-map-dialog';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { EntityIcon } from '@/components/entity-icon';
import { EntityPicker } from '@/components/entity-picker';
import { Button } from '@/components/ui/button';
import { Input, Label, NativeSelect, Textarea } from '@/components/ui/inputs';
import { ENTITY_ICONS } from '@/lib/entity-icons';
import { FEATURE_KIND_ICONS } from '@/lib/feature-kind-icons';
import { COLOR_PRESETS, resolveStyle, SIZE_LABELS, ZOOM_CHOICES } from '@/lib/map-style';
import { cn } from '@/lib/utils';
import { useWorld } from '@/lib/world-context';

function Segmented<T extends string>({
  value,
  options,
  onChange,
  label,
}: {
  value: T;
  options: readonly { value: T; label: ReactNode }[];
  onChange: (value: T) => void;
  label: string;
}) {
  return (
    <div
      role="radiogroup"
      aria-label={label}
      className="inline-flex rounded-md border bg-card p-0.5"
    >
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          role="radio"
          aria-checked={value === option.value}
          onClick={() => onChange(option.value)}
          className={cn(
            'rounded px-2.5 py-1 text-[13px] transition-colors',
            value === option.value
              ? 'bg-accent font-medium text-accent-foreground'
              : 'text-muted-foreground hover:text-foreground',
          )}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      {children}
    </div>
  );
}

/** Details of the selected pin, label, path or region; editable when the viewer can edit. */
export function FeaturePanel({
  feature,
  map,
  maps,
  canEdit,
  autoFocusLabel,
  onChange,
  onDelete,
  onClose,
}: {
  feature: MapFeature;
  map: AtlasMap;
  maps: AtlasMap[];
  canEdit: boolean;
  autoFocusLabel: boolean;
  onChange: (patch: FeatureUpdateInput) => void;
  onDelete: () => Promise<unknown>;
  onClose: () => void;
}) {
  const { base, typeById } = useWorld();
  const [label, setLabel] = useState(feature.label);
  const [notes, setNotes] = useState(feature.notes);
  const style = resolveStyle(feature, typeById);
  const entityType = feature.entity ? typeById.get(feature.entity.typeId) : undefined;
  const Icon = FEATURE_KIND_ICONS[feature.kind];
  const linkedMap = maps.find((m) => m.id === feature.linkMapId);
  const hasLine = feature.kind === 'path' || feature.kind === 'region';

  const commitLabel = () => {
    const next = label.trim();
    if (next === feature.label) return;
    // A text label is nothing without its text.
    if (feature.kind === 'label' && !next) setLabel(feature.label);
    else onChange({ label: next });
  };
  const commitNotes = () => {
    if (notes.trim() !== feature.notes) onChange({ notes: notes.trim() });
  };

  return (
    <div className="space-y-5 p-4">
      <div className="flex items-start gap-2">
        <span className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-md border bg-card text-muted-foreground">
          <Icon className="size-4" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-xs text-muted-foreground">{FEATURE_KIND_LABELS[feature.kind]}</p>
          <h2 className="truncate font-serif text-lg font-semibold">
            {style.name || `Unnamed ${FEATURE_KIND_LABELS[feature.kind].toLowerCase()}`}
          </h2>
        </div>
        <Button variant="ghost" size="icon-sm" onClick={onClose}>
          <X />
          <span className="sr-only">Close</span>
        </Button>
      </div>

      {feature.entity ? (
        <div className="rounded-lg border bg-card p-3">
          <Link
            to={`${base}/e/${feature.entity.id}`}
            className="group flex items-center gap-2 text-sm font-medium"
          >
            <EntityIcon icon={entityType?.icon ?? 'file-text'} color={entityType?.color} />
            <span className="truncate group-hover:underline">{feature.entity.name}</span>
            <ExternalLink className="ml-auto size-3.5 shrink-0 text-muted-foreground" />
          </Link>
          {feature.entity.summary ? (
            <p className="mt-1.5 line-clamp-4 text-[13px] text-muted-foreground">
              {feature.entity.summary}
            </p>
          ) : null}
        </div>
      ) : null}

      {linkedMap ? (
        <Button asChild className="w-full">
          <Link to={`${base}/atlas/${linkedMap.id}`}>
            Open {linkedMap.name} <ExternalLink />
          </Link>
        </Button>
      ) : null}

      {canEdit ? (
        <>
          <Field label={feature.kind === 'label' ? 'Text' : 'Name'}>
            <Input
              value={label}
              maxLength={120}
              autoFocus={autoFocusLabel}
              placeholder={feature.entity?.name ?? 'Unnamed'}
              onChange={(event) => setLabel(event.target.value)}
              onBlur={commitLabel}
              onKeyDown={(event) => {
                if (event.key === 'Enter') event.currentTarget.blur();
              }}
            />
          </Field>

          {feature.kind !== 'label' ? (
            <Field label="Linked entry">
              <div className="flex items-center gap-2">
                <EntityPicker
                  onSelect={(entity) => onChange({ entityId: entity.id })}
                  trigger={
                    <Button variant="outline" className="min-w-0 flex-1 justify-start">
                      <Link2 />
                      <span className="truncate">
                        {feature.entity ? feature.entity.name : 'Link a character, place…'}
                      </span>
                    </Button>
                  }
                />
                {feature.entityId ? (
                  <Button variant="ghost" size="icon" onClick={() => onChange({ entityId: null })}>
                    <X />
                    <span className="sr-only">Unlink entry</span>
                  </Button>
                ) : null}
              </div>
            </Field>
          ) : null}

          {feature.kind !== 'label' ? (
            <Field label="Opens map">
              <NativeSelect
                value={feature.linkMapId ?? ''}
                onChange={(event) => onChange({ linkMapId: event.target.value || null })}
              >
                <option value="">Nothing</option>
                {maps
                  .filter((m) => m.id !== map.id)
                  .map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.name}
                    </option>
                  ))}
              </NativeSelect>
              <UploadMapDialog
                defaultParentId={map.id}
                onCreated={(created) => onChange({ linkMapId: created.id })}
                trigger={
                  <Button variant="ghost" size="sm" className="-ml-2">
                    <Plus /> Upload a new map for this
                  </Button>
                }
              />
            </Field>
          ) : null}

          <Field label="Colour">
            <div className="flex flex-wrap items-center gap-1.5">
              <button
                type="button"
                title="Automatic"
                aria-label="Automatic colour"
                onClick={() => onChange({ color: null })}
                className={cn(
                  'h-6 rounded-full border px-2 text-[11px] text-muted-foreground',
                  feature.color === null && 'border-primary text-foreground',
                )}
              >
                Auto
              </button>
              {COLOR_PRESETS.map((color) => (
                <button
                  key={color}
                  type="button"
                  aria-label={`Colour ${color}`}
                  onClick={() => onChange({ color })}
                  style={{ backgroundColor: color }}
                  className={cn(
                    'size-6 rounded-full border-2 border-card ring-1 ring-border',
                    feature.color === color && 'ring-2 ring-primary',
                  )}
                />
              ))}
              <input
                type="color"
                aria-label="Custom colour"
                value={style.color}
                onChange={(event) => onChange({ color: event.target.value })}
                className="size-6 cursor-pointer rounded-full border-0 bg-transparent p-0"
              />
            </div>
          </Field>

          {feature.kind === 'pin' ? (
            <Field label="Icon">
              <div className="flex flex-wrap gap-1">
                <button
                  type="button"
                  onClick={() => onChange({ icon: null })}
                  className={cn(
                    'h-8 rounded-md border px-2 text-[11px] text-muted-foreground',
                    feature.icon === null && 'border-primary text-foreground',
                  )}
                >
                  Auto
                </button>
                {Object.entries(ENTITY_ICONS).map(([key, IconComponent]) => (
                  <button
                    key={key}
                    type="button"
                    title={key}
                    aria-label={key}
                    onClick={() => onChange({ icon: key })}
                    className={cn(
                      'flex size-8 items-center justify-center rounded-md border text-muted-foreground hover:text-foreground',
                      feature.icon === key && 'border-primary bg-accent text-accent-foreground',
                    )}
                  >
                    <IconComponent className="size-4" />
                  </button>
                ))}
              </div>
            </Field>
          ) : null}

          <Field label={feature.kind === 'label' ? 'Text size' : hasLine ? 'Line weight' : 'Size'}>
            <Segmented
              label="Size"
              value={feature.size}
              options={FEATURE_SIZES.map((size) => ({ value: size, label: SIZE_LABELS[size] }))}
              onChange={(size) => onChange({ size })}
            />
          </Field>

          {hasLine ? (
            <Field label="Line style">
              <Segmented
                label="Line style"
                value={feature.lineStyle}
                options={LINE_STYLES.map((s) => ({
                  value: s,
                  label: s[0]!.toUpperCase() + s.slice(1),
                }))}
                onChange={(lineStyle) => onChange({ lineStyle })}
              />
            </Field>
          ) : null}

          <Field label="Shows">
            <NativeSelect
              value={feature.minZoom}
              onChange={(event) => onChange({ minZoom: Number(event.target.value) })}
            >
              {ZOOM_CHOICES.slice(0, MAX_FEATURE_ZOOM + 1).map((choice, level) => (
                <option key={choice} value={level}>
                  {choice}
                </option>
              ))}
            </NativeSelect>
          </Field>

          <Field label="Notes">
            <Textarea
              value={notes}
              maxLength={5000}
              onChange={(event) => setNotes(event.target.value)}
              onBlur={commitNotes}
            />
          </Field>

          {hasLine ? (
            <p className="text-xs text-muted-foreground">
              Drag the squares to reshape it. Double-click the line to add a point, or right-click a
              point to remove it.
            </p>
          ) : (
            <p className="text-xs text-muted-foreground">Drag it on the map to move it.</p>
          )}

          <ConfirmDialog
            trigger={
              <Button variant="outline" className="w-full text-destructive">
                <Trash2 /> Delete {FEATURE_KIND_LABELS[feature.kind].toLowerCase()}
              </Button>
            }
            title={`Delete this ${FEATURE_KIND_LABELS[feature.kind].toLowerCase()}?`}
            description="It is removed from this map. Any linked entry is not affected."
            onConfirm={onDelete}
          />
        </>
      ) : feature.notes ? (
        <p className="whitespace-pre-wrap text-sm">{feature.notes}</p>
      ) : null}
    </div>
  );
}
