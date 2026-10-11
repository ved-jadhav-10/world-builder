import type { RichTextDoc } from './schemas/entity';

/*
 * Turns the editor's document (TipTap / ProseMirror JSON) into Markdown. It handles what the
 * editor can produce, and anything it doesn't know falls back to its plain text, so content is
 * never silently dropped.
 */

interface Mark {
  type: string;
  attrs?: Record<string, unknown>;
}
interface Node {
  type?: string;
  text?: string;
  attrs?: Record<string, unknown>;
  marks?: Mark[];
  content?: Node[];
}

/** Escapes characters that would be read as Markdown formatting. */
function escapeText(text: string): string {
  return text.replace(/[\\`*_[\]<>~]/g, (c) => `\\${c}`);
}

/** A line that starts like a heading, list or quote would turn into one; neutralise that. */
function escapeLineStart(line: string): string {
  return line
    .replace(/^(\s*)(#{1,6})(\s|$)/, '$1\\$2$3')
    .replace(/^(\s*)([-+])(\s)/, '$1\\$2$3')
    .replace(/^(\s*)(\d+)([.)])(\s)/, '$1$2\\$3$4')
    .replace(/^(\s*)>/, '$1\\>');
}

function applyMarks(text: string, marks: Mark[] = []): string {
  const has = (type: string) => marks.some((m) => m.type === type);
  if (has('code')) {
    const fence = text.includes('`') ? '``' : '`';
    return `${fence}${text}${fence}`;
  }
  let out = escapeText(text);
  // Markers must hug the text, not the spaces around it.
  const [, lead = '', core = '', trail = ''] = /^(\s*)([\s\S]*?)(\s*)$/.exec(out) ?? [];
  if (!core) return out;
  out = core;
  if (has('strike')) out = `~~${out}~~`;
  if (has('italic')) out = `*${out}*`;
  if (has('bold')) out = `**${out}**`;
  const link = marks.find((m) => m.type === 'link');
  const href = typeof link?.attrs?.href === 'string' ? link.attrs.href : null;
  if (href) out = `[${out}](${href.replace(/\)/g, '%29')})`;
  return lead + out + trail;
}

function inline(nodes: Node[] = []): string {
  return nodes
    .map((node) => {
      if (node.type === 'text') return applyMarks(node.text ?? '', node.marks);
      if (node.type === 'hardBreak') return '  \n';
      return inline(node.content); // Unknown inline content: keep its text.
    })
    .join('');
}

function indentLines(text: string, prefix: string, firstPrefix = prefix): string {
  return text
    .split('\n')
    .map((line, i) => (line === '' ? '' : (i === 0 ? firstPrefix : prefix) + line))
    .join('\n');
}

function blocks(nodes: Node[] = []): string[] {
  const out: string[] = [];
  for (const node of nodes) {
    const rendered = block(node);
    if (rendered !== null && rendered !== '') out.push(rendered);
  }
  return out;
}

function listItems(node: Node, ordered: boolean): string {
  const start = typeof node.attrs?.start === 'number' ? node.attrs.start : 1;
  return (node.content ?? [])
    .map((item, index) => {
      const marker = ordered ? `${start + index}. ` : '- ';
      const parts = blocks(item.content);
      // The first block sits on the marker's line; later blocks and nested lists hang beneath it.
      const [first = '', ...rest] = parts;
      const indent = ' '.repeat(marker.length);
      // A nested list follows directly; any other later block is set apart by a blank line.
      const separator = rest.length && !/^\s*([-*]|\d+\.) /.test(rest[0]!) ? '\n\n' : '\n';
      return indentLines([first, ...rest].join(separator), indent, marker);
    })
    .join('\n');
}

function block(node: Node): string | null {
  switch (node.type) {
    case 'paragraph':
      return inline(node.content).split('\n').map(escapeLineStart).join('\n').trimEnd();
    case 'heading': {
      const level = Math.min(6, Math.max(1, Number(node.attrs?.level) || 2));
      return `${'#'.repeat(level)} ${inline(node.content).trim()}`;
    }
    case 'bulletList':
      return listItems(node, false);
    case 'orderedList':
      return listItems(node, true);
    case 'blockquote':
      // Blank lines inside a quote still carry the marker, or the quote would split in two.
      return blocks(node.content)
        .join('\n\n')
        .split('\n')
        .map((line) => (line === '' ? '>' : `> ${line}`))
        .join('\n');
    case 'codeBlock': {
      const code = (node.content ?? []).map((n) => n.text ?? '').join('');
      const longest = Math.max(0, ...(code.match(/`+/g) ?? []).map((run) => run.length));
      const fence = '`'.repeat(Math.max(3, longest + 1));
      const language = typeof node.attrs?.language === 'string' ? node.attrs.language : '';
      return `${fence}${language}\n${code}\n${fence}`;
    }
    case 'horizontalRule':
      return '---';
    case 'doc':
    case 'listItem':
      return blocks(node.content).join('\n\n');
    default:
      // A node we don't know: keep whatever text it holds.
      return node.content ? blocks(node.content).join('\n\n') || inline(node.content) : null;
  }
}

export function richTextToMarkdown(doc: RichTextDoc | null | undefined): string {
  if (!doc) return '';
  return blocks((doc.content ?? []) as Node[])
    .join('\n\n')
    .trim();
}
