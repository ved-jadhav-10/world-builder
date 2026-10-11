import { ExternalLink } from 'lucide-react';
import type { FieldDefinition } from '@atlas/shared';
import { Input, NativeSelect, Textarea } from '@/components/ui/inputs';
import { cn } from '@/lib/utils';

interface FieldRendererProps {
  id: string;
  field: FieldDefinition;
  value: unknown;
  onChange: (value: unknown) => void;
  disabled?: boolean;
  invalid?: boolean;
}

const isHttpUrl = (value: string) => /^https?:\/\/\S+$/i.test(value);

/** Renders the input for one field of an entity type's field schema. */
export function FieldRenderer({
  id,
  field,
  value,
  onChange,
  disabled,
  invalid,
}: FieldRendererProps) {
  const common = { id, disabled, 'aria-invalid': invalid || undefined };

  switch (field.type) {
    case 'long_text':
      return (
        <Textarea
          {...common}
          rows={2}
          className="min-h-14"
          value={typeof value === 'string' ? value : ''}
          onChange={(e) => onChange(e.target.value)}
        />
      );
    case 'number':
      return (
        <Input
          {...common}
          type="number"
          step="any"
          value={typeof value === 'number' ? value : ''}
          onChange={(e) => onChange(e.target.value === '' ? null : e.target.valueAsNumber)}
        />
      );
    case 'select':
      return (
        <NativeSelect
          {...common}
          value={typeof value === 'string' ? value : ''}
          onChange={(e) => onChange(e.target.value)}
        >
          <option value="">—</option>
          {field.options?.map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </NativeSelect>
      );
    case 'multi_select': {
      const selected = Array.isArray(value) ? (value as string[]) : [];
      return (
        <div className="flex flex-wrap gap-1.5" id={id}>
          {field.options?.map((option) => {
            const on = selected.includes(option);
            return (
              <button
                key={option}
                type="button"
                disabled={disabled}
                aria-pressed={on}
                onClick={() =>
                  onChange(on ? selected.filter((s) => s !== option) : [...selected, option])
                }
                className={cn(
                  'rounded-full border px-2.5 py-0.5 text-xs transition-colors',
                  on
                    ? 'border-primary bg-primary text-primary-foreground'
                    : 'bg-card hover:bg-muted',
                )}
              >
                {option}
              </button>
            );
          })}
        </div>
      );
    }
    case 'boolean':
      return (
        <input
          {...common}
          type="checkbox"
          className="size-4 accent-primary"
          checked={value === true}
          onChange={(e) => onChange(e.target.checked)}
        />
      );
    case 'url': {
      const text = typeof value === 'string' ? value : '';
      return (
        <div className="flex gap-1.5">
          <Input
            {...common}
            type="url"
            placeholder="https://"
            value={text}
            onChange={(e) => onChange(e.target.value)}
          />
          {isHttpUrl(text) ? (
            <a
              href={text}
              target="_blank"
              rel="noopener noreferrer"
              className="flex size-9 shrink-0 items-center justify-center rounded-md border hover:bg-muted"
              title="Open link"
            >
              <ExternalLink className="size-4" />
            </a>
          ) : null}
        </div>
      );
    }
    case 'date':
      return (
        <Input
          {...common}
          placeholder="e.g. 3rd of Frostfall, 412 AE"
          value={typeof value === 'string' ? value : ''}
          onChange={(e) => onChange(e.target.value)}
        />
      );
    case 'text':
    default:
      return (
        <Input
          {...common}
          value={typeof value === 'string' ? value : ''}
          onChange={(e) => onChange(e.target.value)}
        />
      );
  }
}
