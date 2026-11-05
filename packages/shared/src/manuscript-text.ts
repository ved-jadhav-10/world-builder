/*
 * Turns a scene's rich text (a TipTap document) into a flat list of blocks of styled runs, which
 * is what a word processor file needs. Kept free of any file format so it can be tested alone.
 */

export interface TextRun {
  text: string;
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  strike?: boolean;
  code?: boolean;
  /** An address, when the text is a link. */
  link?: string;
  /** A line break inside the paragraph, shown instead of text. */
  lineBreak?: boolean;
}

export type ManuscriptBlock =
  | { kind: 'paragraph'; runs: TextRun[] }
  | { kind: 'heading'; level: 1 | 2 | 3; runs: TextRun[] }
  | { kind: 'quote'; runs: TextRun[] }
  | { kind: 'code'; text: string }
  /** One item of a bulleted or numbered list; `depth` is 0 for the outermost list. */
  | { kind: 'list'; ordered: boolean; depth: number; runs: TextRun[] }
  | { kind: 'rule' };

interface Node {
  type?: string;
  text?: string;
  attrs?: Record<string, unknown>;
  marks?: { type: string; attrs?: Record<string, unknown> }[];
  content?: Node[];
}

/** Links to anything but a web, mail or relative address are dropped, not written into a file. */
const SAFE_LINK = /^(https?:|mailto:)/i;

function runsOf(nodes: Node[] | undefined): TextRun[] {
  const runs: TextRun[] = [];
  for (const node of nodes ?? []) {
    if (node.type === 'hardBreak') {
      runs.push({ text: '', lineBreak: true });
    } else if (node.type === 'text' && node.text) {
      const run: TextRun = { text: node.text };
      for (const mark of node.marks ?? []) {
        if (mark.type === 'bold') run.bold = true;
        else if (mark.type === 'italic') run.italic = true;
        else if (mark.type === 'underline') run.underline = true;
        else if (mark.type === 'strike') run.strike = true;
        else if (mark.type === 'code') run.code = true;
        else if (mark.type === 'link') {
          const href = String(mark.attrs?.href ?? '');
          if (SAFE_LINK.test(href)) run.link = href;
        }
      }
      runs.push(run);
    }
  }
  return runs;
}

const plain = (runs: TextRun[]) => runs.map((r) => (r.lineBreak ? '\n' : r.text)).join('');

function walk(nodes: Node[] | undefined, out: ManuscriptBlock[], quote: boolean, depth: number) {
  for (const node of nodes ?? []) {
    switch (node.type) {
      case 'paragraph': {
        const runs = runsOf(node.content);
        // An empty paragraph is a blank line in the editor, not something to print.
        if (runs.length === 0) break;
        out.push(quote ? { kind: 'quote', runs } : { kind: 'paragraph', runs });
        break;
      }
      case 'heading': {
        const runs = runsOf(node.content);
        if (runs.length === 0) break;
        const level = Math.min(3, Math.max(1, Number(node.attrs?.level ?? 2))) as 1 | 2 | 3;
        out.push({ kind: 'heading', level, runs });
        break;
      }
      case 'blockquote':
        walk(node.content, out, true, depth);
        break;
      case 'bulletList':
      case 'orderedList': {
        const ordered = node.type === 'orderedList';
        for (const item of node.content ?? []) {
          for (const child of item.content ?? []) {
            if (child.type === 'bulletList' || child.type === 'orderedList') {
              walk([child], out, quote, depth + 1);
            } else {
              const runs = runsOf(child.content);
              if (runs.length > 0) out.push({ kind: 'list', ordered, depth, runs });
            }
          }
        }
        break;
      }
      case 'codeBlock': {
        const text = plain(runsOf(node.content));
        if (text) out.push({ kind: 'code', text });
        break;
      }
      case 'horizontalRule':
        out.push({ kind: 'rule' });
        break;
      default:
        // An unknown wrapper: look inside it rather than losing the text.
        if (node.content) walk(node.content, out, quote, depth);
    }
  }
}

/** The blocks of a scene's text, in order. `null` or an empty document gives none. */
export function richTextToBlocks(doc: unknown): ManuscriptBlock[] {
  const out: ManuscriptBlock[] = [];
  walk((doc as Node | null)?.content, out, false, 0);
  return out;
}

/** Words in a list of blocks, for the title page. */
export function blockWords(blocks: readonly ManuscriptBlock[]): number {
  let total = 0;
  for (const block of blocks) {
    const text =
      block.kind === 'code' ? block.text : block.kind === 'rule' ? '' : plain(block.runs);
    total += text.split(/\s+/).filter(Boolean).length;
  }
  return total;
}
