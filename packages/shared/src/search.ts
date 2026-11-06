import { stripSecretBlocks } from './secret-blocks';

/** Postgres caps a tsvector at 1 MB; stay well under it. */
const MAX_SEARCH_TEXT = 200_000;

/** Extracts the visible text from a TipTap/ProseMirror JSON document. */
export function richTextToPlainText(doc: unknown): string {
  const parts: string[] = [];
  const walk = (node: unknown) => {
    if (!node || typeof node !== 'object') return;
    const { text, content } = node as { text?: unknown; content?: unknown };
    if (typeof text === 'string') parts.push(text);
    if (Array.isArray(content)) content.forEach(walk);
  };
  walk(doc);
  return parts.join(' ');
}

export interface SearchableEntity {
  name: string;
  aliases: readonly string[];
  summary: string;
  body: unknown;
  fields: Record<string, unknown>;
}

/** The text an entity is found by: name, aliases, summary, body and text-like field values. */
export function deriveSearchText(
  entity: SearchableEntity,
  /** Fields only the GM sees: their words are not searchable by anyone, like secret blocks. */
  hiddenFieldKeys: readonly string[] = [],
): string {
  const hidden = new Set(hiddenFieldKeys);
  const fieldText = Object.entries(entity.fields)
    .filter(([key]) => !hidden.has(key))
    .map(([, value]) => value)
    .flatMap((value) => {
      if (typeof value === 'string') return [value];
      if (Array.isArray(value)) {
        // Lists of abilities or questions are found by their words too.
        return value.flatMap((item): string[] => {
          if (typeof item === 'string') return [item];
          if (item && typeof item === 'object') {
            return Object.values(item).filter((v): v is string => typeof v === 'string');
          }
          return [];
        });
      }
      return [];
    });
  return [
    entity.name,
    ...entity.aliases,
    entity.summary,
    // Secret blocks are the GM's alone, so their words are not searchable by anyone.
    richTextToPlainText(stripSecretBlocks(entity.body)),
    ...fieldText,
  ]
    .filter(Boolean)
    .join(' ')
    .slice(0, MAX_SEARCH_TEXT);
}
