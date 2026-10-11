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
export function deriveSearchText(entity: SearchableEntity): string {
  const fieldText = Object.values(entity.fields).flatMap((value) => {
    if (typeof value === 'string') return [value];
    if (Array.isArray(value)) return value.filter((v): v is string => typeof v === 'string');
    return [];
  });
  return [
    entity.name,
    ...entity.aliases,
    entity.summary,
    richTextToPlainText(entity.body),
    ...fieldText,
  ]
    .filter(Boolean)
    .join(' ')
    .slice(0, MAX_SEARCH_TEXT);
}
