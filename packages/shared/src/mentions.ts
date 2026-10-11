export interface MentionSource {
  id: string;
  name: string;
  aliases: readonly string[];
}

export interface MentionMatch {
  entityId: string;
  /** Offsets into the searched text. */
  start: number;
  end: number;
}

export interface MentionMatcher {
  find(text: string): MentionMatch[];
}

const MIN_TERM_LENGTH = 2;
const escapeRegExp = (term: string) => term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * Matches entity names and aliases in prose: case-insensitive, whole words only, longest
 * term first ("Mira Vey" beats "Mira"). A term shared by several entities is ambiguous and
 * is ignored rather than guessed at.
 */
export function buildMentionMatcher(sources: readonly MentionSource[]): MentionMatcher {
  const owners = new Map<string, string | null>();
  for (const source of sources) {
    for (const raw of [source.name, ...source.aliases]) {
      const term = raw.trim().replace(/\s+/g, ' ').toLowerCase();
      if (term.length < MIN_TERM_LENGTH) continue;
      const owner = owners.get(term);
      owners.set(term, owner === undefined || owner === source.id ? source.id : null);
    }
  }
  const terms = [...owners].filter(([, owner]) => owner !== null).map(([term]) => term);
  if (terms.length === 0) return { find: () => [] };

  terms.sort((a, b) => b.length - a.length);
  const pattern = terms.map((t) => escapeRegExp(t).replace(/ /g, '\\s+')).join('|');
  const regex = new RegExp(`(?<![\\p{L}\\p{N}_])(?:${pattern})(?![\\p{L}\\p{N}_])`, 'giu');

  return {
    find(text) {
      const matches: MentionMatch[] = [];
      for (const m of text.matchAll(regex)) {
        const entityId = owners.get(m[0].toLowerCase().replace(/\s+/g, ' '));
        if (entityId) matches.push({ entityId, start: m.index, end: m.index + m[0].length });
      }
      return matches;
    },
  };
}

/** Number of mentions per entity across the given texts. */
export function countMentions(
  matcher: MentionMatcher,
  texts: Iterable<string>,
): Map<string, number> {
  const counts = new Map<string, number>();
  for (const text of texts) {
    for (const match of matcher.find(text)) {
      counts.set(match.entityId, (counts.get(match.entityId) ?? 0) + 1);
    }
  }
  return counts;
}

export function countWords(text: string): number {
  return text.match(/[\p{L}\p{N}][\p{L}\p{N}'’-]*/gu)?.length ?? 0;
}

/** Plain text of each text block (paragraph, heading, list item…) of a TipTap document. */
export function richTextBlocks(doc: unknown): string[] {
  const blocks: string[] = [];
  const isInline = (n: unknown) => {
    const node = n as { type?: string; content?: unknown };
    return node?.type === 'text' || node?.type === 'hardBreak' || !Array.isArray(node?.content);
  };
  const walk = (node: unknown) => {
    const { content } = (node ?? {}) as { content?: unknown[] };
    if (!Array.isArray(content) || content.length === 0) return;
    if (content.every(isInline)) {
      blocks.push(
        content
          .map((c) => {
            const { type, text } = c as { type?: string; text?: string };
            return type === 'hardBreak' ? ' ' : (text ?? '');
          })
          .join(''),
      );
    } else {
      content.forEach(walk);
    }
  };
  walk(doc);
  return blocks;
}
