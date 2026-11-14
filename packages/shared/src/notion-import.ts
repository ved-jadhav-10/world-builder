/*
 * Reading a Notion export (Export › Markdown & CSV) into Markdown notes the Markdown importer
 * already understands. Notion's files carry a 32-character ID in every name ("Mira Vey 3f2a….md"),
 * link to each other with plain Markdown links to those names, and write a database row's
 * properties as "Key: value" lines under its title. This file undoes all three: names lose their
 * IDs, links to other pages become [[wikilinks]], and properties become front-matter (type, tags,
 * aliases, summary) or a short list at the top of the article.
 *
 * It is written from how Notion's export looks, and has only been tried on files made to look
 * like it, not on a real workspace export.
 */

export interface NotionFile {
  path: string;
  /** The file's text. Left empty for files that are not read (a database's .csv, say). */
  content: string;
}

export interface NotionNote {
  path: string;
  content: string;
}

const ID = /\s[0-9a-f]{32}(?=\.[A-Za-z0-9]+$|$)/i;
const cleanSegment = (segment: string) => segment.replace(ID, '');
const isMarkdown = (path: string) => /\.(md|markdown)$/i.test(path);

const base = (path: string) => path.replace(/\\/g, '/').split('/').pop() ?? path;

/** True when most of the notes carry Notion's ID in their file name. */
export function looksLikeNotion(paths: readonly string[]): boolean {
  const notes = paths.filter(isMarkdown);
  if (notes.length === 0) return false;
  return notes.filter((path) => ID.test(base(path))).length / notes.length >= 0.5;
}

const SKIPPED = new Set([
  'created',
  'created time',
  'created by',
  'last edited',
  'last edited time',
  'last edited by',
  'id',
]);
const TYPE_KEYS = ['type', 'category', 'kind'];
const TAG_KEYS = ['tags', 'tag', 'labels'];
const ALIAS_KEYS = ['aliases', 'alias', 'aka', 'also known as', 'other names'];
const SUMMARY_KEYS = ['summary', 'description', 'blurb'];

const safeTitle = (title: string) =>
  title
    .replace(/[\\/]+/g, '-')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 200);

/** Notion's HTML leftovers (callouts, toggles, line breaks), reduced to the text inside. */
function stripHtml(text: string): string {
  return text
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(
      /<\/?(aside|details|summary|span|div|p|u|mark|sup|sub|table|tbody|thead|tr|td|th|colgroup|col|figure|figcaption|center)\b[^>]*>/gi,
      '',
    );
}

function decodePath(href: string): string {
  try {
    return decodeURIComponent(href);
  } catch {
    return href;
  }
}

interface Parsed {
  title: string;
  properties: [string, string][];
  body: string;
}

/** The title, then (for a database row) the property lines, then the rest. */
function split(content: string, hasProperties: boolean): Parsed | null {
  const text = content.charCodeAt(0) === 0xfeff ? content.slice(1) : content;
  const lines = text.replace(/\r\n/g, '\n').split('\n');
  let i = 0;
  while (i < lines.length && !lines[i]!.trim()) i++;
  let title = '';
  if (i < lines.length && /^#\s+/.test(lines[i]!)) {
    title = lines[i]!.replace(/^#\s+/, '').trim();
    i++;
  }
  const properties: [string, string][] = [];
  if (hasProperties) {
    while (i < lines.length && !lines[i]!.trim()) i++;
    while (i < lines.length) {
      const pair = /^([A-Za-z][^:\n]{0,40}):\s*(.*)$/.exec(lines[i]!);
      if (!pair) break;
      properties.push([pair[1]!.trim(), pair[2]!.trim()]);
      i++;
    }
  }
  return { title, properties, body: lines.slice(i).join('\n').trim() };
}

/**
 * Every Notion page, as a note. `files` is everything in the export (the .csv files may come with
 * empty content: they only show which folders are databases).
 */
export function notionToNotes(files: readonly NotionFile[]): NotionNote[] {
  const all = new Set(files.map((file) => file.path.replace(/\\/g, '/')));
  const pages = files.filter((file) => isMarkdown(file.path));

  // A folder next to a "<name>.csv" is a database, and its pages are rows with properties.
  const isRow = (path: string) => {
    const folder = path.replace(/\\/g, '/').split('/').slice(0, -1).join('/');
    return folder !== '' && (all.has(`${folder}.csv`) || all.has(`${folder}_all.csv`));
  };

  const parsed = pages.map((file) => {
    const path = file.path.replace(/\\/g, '/');
    const page = split(file.content, isRow(path));
    const fileTitle = cleanSegment(base(path).replace(/\.(md|markdown)$/i, ''));
    // Notion cuts long names in the file; the title inside is whole.
    const title = safeTitle(page?.title || fileTitle) || 'Untitled';
    return { path, page: page!, title };
  });

  // Where a link's address points: by the file's own name, which carries a unique ID.
  const titleByFile = new Map<string, string>();
  const titleByName = new Map<string, string>();
  for (const { path, title } of parsed) {
    titleByFile.set(base(path).toLowerCase(), title);
    titleByName.set(title.toLowerCase(), title);
  }

  const wikilink = (text: string, href: string): string => {
    if (/^https?:\/\//i.test(href)) return `[${text}](${href})`;
    const target = decodePath(href);
    if (!isMarkdown(target)) return text;
    const title = titleByFile.get(base(target).toLowerCase());
    if (!title) return text;
    return text.trim() && text.trim() !== title ? `[[${title}|${text.trim()}]]` : `[[${title}]]`;
  };

  const convert = (text: string) =>
    stripHtml(text)
      .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
      .replace(/\[([^\]]*)\]\(([^)\s]+)\)/g, (_, label: string, href: string) =>
        wikilink(label, href),
      );

  return parsed.map(({ path, page, title }) => {
    const segments = path.split('/');
    const parent = segments.length > 1 ? cleanSegment(segments[segments.length - 2]!) : '';

    let type = '';
    let tags: string[] = [];
    let aliases: string[] = [];
    let summary = '';
    const others: string[] = [];
    const extras: string[] = [];
    for (const [key, raw] of page.properties) {
      const name = key.toLowerCase();
      const value = convert(raw).trim();
      if (!value || SKIPPED.has(name)) continue;
      const list = () =>
        value
          .split(',')
          .map((part) => part.trim().replace(/^\[\[(.*?)(?:\|.*)?\]\]$/, '$1'))
          .filter(Boolean);
      if (TYPE_KEYS.includes(name) && !type) type = value.replace(/^\[\[(.*?)(?:\|.*)?\]\]$/, '$1');
      else if (TAG_KEYS.includes(name)) tags = [...tags, ...list()];
      else if (ALIAS_KEYS.includes(name)) aliases = [...aliases, ...list()];
      else if (SUMMARY_KEYS.includes(name) && !summary) summary = value.replace(/\s+/g, ' ');
      // A plain value may be a field of the type (Age, Hometown); one with links in it, or a
      // name front-matter cannot hold, is written into the article instead.
      else if (
        /^[A-Za-z0-9_ -]+$/.test(key) &&
        !/^(title|name|publish|permalink|modified|updated|cssclasses?)$/i.test(key) &&
        !value.includes('[[') &&
        !value.startsWith('[')
      )
        extras.push(`${key}: ${value.replace(/\s+/g, ' ')}`);
      else others.push(`- **${key}:** ${value}`);
    }

    const front: string[] = [];
    if (type) front.push(`type: ${type}`);
    if (aliases.length) front.push(`aliases: [${aliases.join(', ')}]`);
    if (tags.length) front.push(`tags: [${tags.join(', ')}]`);
    if (summary) front.push(`summary: ${summary}`);
    front.push(...extras);

    const text = [
      front.length ? `---\n${front.join('\n')}\n---\n` : '',
      `# ${title}`,
      others.length ? `\n${others.join('\n')}` : '',
      page.body ? `\n${convert(page.body)}` : '',
    ].join('\n');
    return { path: `${parent ? `${safeTitle(parent)}/` : ''}${title}.md`, content: text };
  });
}
