import { z } from 'zod';
import type { RichTextDoc } from './schemas/entity';

/*
 * Reading Markdown notes into entries: a vault from Obsidian, a folder of notes from anywhere
 * else, or this app's own Markdown export. One note becomes one entry. The front-matter gives the
 * type, other names and tags when it has them; the folder a note sits in is the fallback for its
 * type. [[Wikilinks]] between notes become links between entries.
 */

export interface ParsedNote {
  name: string;
  /** What the note says it is ("character", "Locations"), or null when it does not say. */
  typeHint: string | null;
  aliases: string[];
  tags: string[];
  summary: string;
  body: RichTextDoc | null;
  /** Names of the notes this one links to, each once, in order of first mention. */
  links: string[];
}

export const MAX_IMPORT_NOTES = 400;

export const markdownImportSchema = z.object({
  notes: z
    .array(
      z.object({
        /** Path inside the vault, with forward slashes, such as "Characters/Mira Vey.md". */
        path: z.string().min(1).max(500),
        content: z.string().max(200_000),
      }),
    )
    .min(1)
    .max(MAX_IMPORT_NOTES),
  /** The type for notes that do not say what they are and sit in no telling folder. */
  defaultTypeKey: z.string().min(1).max(48).default('lore_article'),
});
export type MarkdownImportInput = z.input<typeof markdownImportSchema>;

export const markdownLinksSchema = z.object({
  links: z
    .array(z.object({ from: z.string().min(1).max(200), to: z.string().min(1).max(200) }))
    .max(5000),
});

export interface MarkdownImportResult {
  created: number;
  /** Notes left out because an entry of that name already exists. */
  skipped: string[];
  /** How many entries went to each type, by type name. */
  byType: Record<string, number>;
}

type Inline = { type: 'text'; text: string; marks?: { type: string; attrs?: object }[] };
type Block = { type: string; attrs?: object; content?: (Block | Inline)[] };

/** The front-matter block, read as plain `key: value` lines and simple lists. */
function readFrontMatter(text: string): { data: Record<string, string | string[]>; rest: string } {
  const match = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/.exec(text);
  if (!match) return { data: {}, rest: text };
  const data: Record<string, string | string[]> = {};
  let listKey: string | null = null;
  for (const line of match[1]!.split(/\r?\n/)) {
    const item = /^\s*-\s+(.*)$/.exec(line);
    if (item && listKey) {
      (data[listKey] as string[]).push(unquote(item[1]!));
      continue;
    }
    const pair = /^([A-Za-z0-9_ -]+):\s*(.*)$/.exec(line);
    if (!pair) continue;
    const key = pair[1]!.trim().toLowerCase();
    const value = pair[2]!.trim();
    if (value === '') {
      data[key] = [];
      listKey = key;
    } else if (value.startsWith('[') && value.endsWith(']')) {
      data[key] = value
        .slice(1, -1)
        .split(',')
        .map((part) => unquote(part.trim()))
        .filter(Boolean);
      listKey = null;
    } else {
      data[key] = unquote(value);
      listKey = null;
    }
  }
  return { data, rest: text.slice(match[0].length) };
}

const unquote = (value: string) => value.replace(/^(['"])(.*)\1$/, '$2').trim();

const asList = (value: string | string[] | undefined): string[] =>
  value === undefined ? [] : Array.isArray(value) ? value : value ? [value] : [];

const asText = (value: string | string[] | undefined): string =>
  Array.isArray(value) ? (value[0] ?? '') : (value ?? '');

/** Inline Markdown to text with marks. Wikilinks become their label and are noted in `links`. */
function inline(text: string, links: Set<string>): Inline[] {
  const out: Inline[] = [];
  const push = (value: string, marks?: Inline['marks']) => {
    if (!value) return;
    const last = out.at(-1);
    // Plain text either side of a wikilink is one run of text, not three.
    if (!marks && last && !last.marks) last.text += value;
    else out.push(marks ? { type: 'text', text: value, marks } : { type: 'text', text: value });
  };
  const pattern =
    /!?\[\[([^\]|#]+)(?:#[^\]|]*)?(?:\|([^\]]+))?\]\]|\*\*([^*]+)\*\*|__([^_]+)__|\*([^*\n]+)\*|(?<![A-Za-z0-9])_([^_\n]+)_(?![A-Za-z0-9])|`([^`]+)`|\[([^\]]+)\]\(([^)\s]+)\)/g;
  let last = 0;
  for (const match of text.matchAll(pattern)) {
    push(text.slice(last, match.index));
    last = match.index + match[0].length;
    if (match[1] !== undefined) {
      const target = match[1].trim().split('/').pop()!;
      // An embedded picture (![[file.png]]) is not a note.
      if (match[0].startsWith('!')) continue;
      links.add(target);
      push((match[2] ?? target).trim());
    } else if (match[3] !== undefined || match[4] !== undefined) {
      push((match[3] ?? match[4])!, [{ type: 'bold' }]);
    } else if (match[5] !== undefined || match[6] !== undefined) {
      push((match[5] ?? match[6])!, [{ type: 'italic' }]);
    } else if (match[7] !== undefined) {
      push(match[7], [{ type: 'code' }]);
    } else if (match[8] !== undefined) {
      const href = match[9]!;
      if (/^https?:\/\//i.test(href)) push(match[8], [{ type: 'link', attrs: { href } }]);
      else push(match[8]);
    }
  }
  push(text.slice(last));
  return out;
}

const paragraph = (text: string, links: Set<string>): Block => ({
  type: 'paragraph',
  content: inline(text, links),
});

/** Markdown blocks to an article: headings, paragraphs, lists, quotes and rules. */
function toDoc(markdown: string, links: Set<string>): RichTextDoc | null {
  const blocks: Block[] = [];
  const lines = markdown.replace(/\r\n/g, '\n').split('\n');
  let i = 0;
  while (i < lines.length) {
    const line = lines[i]!;
    if (!line.trim()) {
      i++;
      continue;
    }
    if (/^```/.test(line)) {
      const code: string[] = [];
      i++;
      while (i < lines.length && !/^```/.test(lines[i]!)) code.push(lines[i++]!);
      i++;
      if (code.length) {
        blocks.push({ type: 'codeBlock', content: [{ type: 'text', text: code.join('\n') }] });
      }
      continue;
    }
    const heading = /^(#{1,6})\s+(.*)$/.exec(line);
    if (heading) {
      const content = inline(heading[2]!.replace(/\s+#+\s*$/, ''), links);
      if (content.length) {
        blocks.push({
          type: 'heading',
          attrs: { level: heading[1]!.length >= 3 ? 3 : 2 },
          content,
        });
      }
      i++;
      continue;
    }
    if (/^\s*([-*_])\s*(\1\s*){2,}$/.test(line)) {
      blocks.push({ type: 'horizontalRule' });
      i++;
      continue;
    }
    if (/^\s*>/.test(line)) {
      const quoted: string[] = [];
      while (i < lines.length && /^\s*>/.test(lines[i]!)) {
        quoted.push(lines[i++]!.replace(/^\s*>\s?/, ''));
      }
      const text = quoted.join(' ').trim();
      if (text) blocks.push({ type: 'blockquote', content: [paragraph(text, links)] });
      continue;
    }
    const bullet = /^\s*[-*+]\s+(.*)$/;
    const numbered = /^\s*\d+[.)]\s+(.*)$/;
    if (bullet.test(line) || numbered.test(line)) {
      const ordered = numbered.test(line);
      const test = ordered ? numbered : bullet;
      const items: Block[] = [];
      while (i < lines.length && test.test(lines[i]!)) {
        const text = test.exec(lines[i++]!)![1]!.replace(/^\[[ xX]\]\s+/, '');
        items.push({ type: 'listItem', content: [paragraph(text, links)] });
      }
      blocks.push({ type: ordered ? 'orderedList' : 'bulletList', content: items });
      continue;
    }
    // A paragraph runs until a blank line or the start of another kind of block.
    const text: string[] = [];
    while (
      i < lines.length &&
      lines[i]!.trim() &&
      !/^(#{1,6}\s|```|\s*>|\s*[-*+]\s|\s*\d+[.)]\s)/.test(lines[i]!)
    ) {
      text.push(lines[i++]!.trim());
    }
    const content = inline(text.join(' '), links);
    if (content.length) blocks.push({ type: 'paragraph', content });
  }
  return blocks.length ? ({ type: 'doc', content: blocks } as RichTextDoc) : null;
}

/** One note, read. `path` is where it sat in the vault; its folder may say what it is. */
export function parseMarkdownNote(path: string, content: string): ParsedNote {
  const parts = path.replace(/\\/g, '/').split('/').filter(Boolean);
  const file = parts.pop() ?? 'Untitled';
  const { data, rest } = readFrontMatter(
    content.charCodeAt(0) === 0xfeff ? content.slice(1) : content,
  );
  let text = rest;
  // A first heading that repeats the note's name is the title, not part of the article.
  const fileName = file.replace(/\.(md|markdown|txt)$/i, '');
  const title = /^\s*#\s+(.+?)\s*\n/.exec(text + '\n');
  const name = (asText(data.title) || asText(data.name) || fileName).slice(0, 200);
  if (title && title[1]!.trim().toLowerCase() === name.toLowerCase()) {
    text = text.slice(text.indexOf(title[0]) + title[0].length);
  }
  const links = new Set<string>();
  const body = toDoc(text, links);
  links.delete(name);
  return {
    name,
    typeHint: asText(data.type) || asText(data.category) || parts[0] || null,
    aliases: asList(data.aliases ?? data.alias)
      .map((alias) => alias.slice(0, 200))
      .filter((alias) => alias && alias.toLowerCase() !== name.toLowerCase())
      .slice(0, 50),
    tags: asList(data.tags ?? data.tag)
      .map((tag) => tag.replace(/^#/, '').slice(0, 50))
      .filter(Boolean)
      .slice(0, 20),
    summary: (asText(data.summary) || asText(data.description)).slice(0, 2000),
    body,
    links: [...links],
  };
}

/** "Characters", "character", "NPCs/People" and the like, reduced to something comparable. */
const simplify = (value: string) =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/ies$/, 'y')
    .replace(/s$/, '');

/** A few words people use for their folders that are not the built-in names. */
const SYNONYMS: Record<string, string> = {
  npc: 'character',
  pc: 'character',
  people: 'character',
  person: 'character',
  place: 'location',
  city: 'location',
  town: 'location',
  region: 'location',
  organisation: 'faction',
  organization: 'faction',
  group: 'faction',
  guild: 'faction',
  object: 'item',
  artifact: 'item',
  race: 'species',
  creature: 'species',
  history: 'event',
  lore: 'lore_article',
  article: 'lore_article',
  note: 'lore_article',
  god: 'religion',
  deity: 'religion',
  magic: 'magic_system',
};

/** The world's type a note belongs to, by its hint; `fallback` when nothing matches. */
export function matchTypeKey(
  hint: string | null,
  types: readonly { key: string; name: string }[],
  fallback: string,
): string {
  const wanted = hint ? simplify(hint) : '';
  if (wanted) {
    for (const type of types) {
      if (simplify(type.key.replace(/_/g, ' ')) === wanted || simplify(type.name) === wanted) {
        return type.key;
      }
    }
    const synonym = SYNONYMS[wanted];
    if (synonym && types.some((type) => type.key === synonym)) return synonym;
  }
  return types.some((type) => type.key === fallback) ? fallback : (types[0]?.key ?? fallback);
}
