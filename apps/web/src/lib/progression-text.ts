import type { EntityType, ProgressionChanges } from '@atlas/shared';

/** A field value in words, for the history list. Empty means the change clears the field. */
function valueText(value: unknown): string {
  if (value === null || value === undefined || value === '') return '';
  if (Array.isArray(value)) return value.join(', ');
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  return String(value);
}

/** "Rank: Captain", "Home cleared", "Summary changed": what a progression does. */
export function describeChanges(type: EntityType, changes: ProgressionChanges): string[] {
  const lines = Object.entries(changes.fields ?? {}).map(([key, value]) => {
    const label = type.fieldSchema.find((f) => f.key === key)?.label ?? key;
    const text = valueText(value);
    return text ? `${label}: ${text}` : `${label} cleared`;
  });
  if (changes.summary !== undefined) lines.push('Summary changed');
  return lines;
}
