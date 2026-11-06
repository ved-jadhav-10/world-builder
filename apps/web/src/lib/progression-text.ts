import { describeFieldValue, type EntityType, type ProgressionChanges } from '@atlas/shared';

/** A field value in words, for the history list. Empty means the change clears the field. */
const valueText = describeFieldValue;

/** What the lookups behind a link change can say: who it is with, and what kinds exist. */
export interface LinkWords {
  /** "Dov (friend of)" for a link id, or null when it has since been deleted. */
  link: (relationshipId: string) => string | null;
  typeLabel: (typeId: string) => string | null;
}

/** "Rank: Captain", "Home cleared", "Summary changed": what a progression does. */
export function describeChanges(
  type: EntityType,
  changes: ProgressionChanges,
  words?: LinkWords,
): string[] {
  const lines = Object.entries(changes.fields ?? {}).map(([key, value]) => {
    const label = type.fieldSchema.find((f) => f.key === key)?.label ?? key;
    const text = valueText(value);
    return text ? `${label}: ${text}` : `${label} cleared`;
  });
  if (changes.summary !== undefined) lines.push('Summary changed');
  if (changes.name !== undefined) lines.push(`Name: ${changes.name}`);
  if (changes.aliases !== undefined) {
    lines.push(
      changes.aliases.length > 0
        ? `Other names: ${changes.aliases.join(', ')}`
        : 'Other names cleared',
    );
  }
  for (const change of changes.relationships ?? []) {
    const who = words?.link(change.relationshipId) ?? 'A link that no longer exists';
    if (change.ended !== undefined) lines.push(`${who}: ${change.ended ? 'ends' : 'resumes'}`);
    if (change.typeId !== undefined) {
      lines.push(`${who}: becomes “${words?.typeLabel(change.typeId) ?? 'another kind'}”`);
    }
    if (change.notes !== undefined) lines.push(`${who}: notes changed`);
  }
  return lines;
}
