import {
  richTextBlocks,
  type EntityRevisionContent,
  type EntityType,
  type SceneRevisionContent,
} from '@atlas/shared';

const formatValue = (value: unknown): string => {
  if (value === null || value === undefined || value === '') return '';
  if (Array.isArray(value)) return value.map(formatValue).filter(Boolean).join(', ');
  if (typeof value === 'boolean') return value ? 'yes' : 'no';
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
};

/** An entry as lines of text, so two versions can be compared. */
export function entityBlocks(content: EntityRevisionContent, type: EntityType | undefined) {
  const labels = new Map((type?.fieldSchema ?? []).map((f) => [f.key, f.label]));
  const blocks = [`Name: ${content.name}`];
  if (content.aliases.length > 0) blocks.push(`Also known as: ${content.aliases.join(', ')}`);
  if (content.summary) blocks.push(`Summary: ${content.summary}`);
  for (const [key, value] of Object.entries(content.fields)) {
    const text = formatValue(value);
    if (text) blocks.push(`${labels.get(key) ?? key}: ${text}`);
  }
  if (content.startDay !== null)
    blocks.push(`${type?.startLabel ?? 'Starts'}: day ${content.startDay}`);
  if (content.endDay !== null) blocks.push(`${type?.endLabel ?? 'Ends'}: day ${content.endDay}`);
  return [...blocks, ...richTextBlocks(content.body)];
}

export function sceneBlocks(content: SceneRevisionContent) {
  const blocks = [`Title: ${content.title}`];
  if (content.summary) blocks.push(`Summary: ${content.summary}`);
  return [...blocks, ...richTextBlocks(content.body)];
}
