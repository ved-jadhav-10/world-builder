import type { ManuscriptBlock, TextRun } from './manuscript-text';

/*
 * Script formats: the manuscript laid out as a screenplay (Fountain, which Final Draft, Highland,
 * Fade In and others open) or a comic script. Prose cannot be turned into a script by a program,
 * so these set up the structure, from your scenes' places, dates and viewpoints, and leave the
 * words for you to adapt: a quoted line becomes dialogue with a SPEAKER to fill in, and
 * everything else becomes action or panel description.
 */

export interface ScriptScene {
  title: string;
  summary: string;
  /** The scene's place, if it has one. */
  location: string | null;
  /** The scene's in-world date, as text. */
  date: string;
  /** Whose point of view it is told from. */
  pov: string | null;
  blocks: ManuscriptBlock[];
}

export interface ScriptChapter {
  title: string;
  scenes: ScriptScene[];
}

export interface ScriptBook {
  title: string;
  chapters: ScriptChapter[];
}

export interface ScriptInput {
  title: string;
  author: string;
  books: ScriptBook[];
}

const plain = (runs: readonly TextRun[]) =>
  runs
    .map((run) => (run.lineBreak ? ' ' : run.text))
    .join('')
    .replace(/\s+/g, ' ')
    .trim();

const OPENERS = new Set(['"', '“', '«']);
const CLOSERS = new Set(['"', '”', '»']);

/** Is the whole paragraph one quoted line of speech? ("Get down," she hissed, is not.) */
export function quotedLine(text: string): string | null {
  const trimmed = text.trim();
  const first = trimmed[0];
  const last = trimmed.at(-1);
  if (trimmed.length < 3 || !first || !last || !OPENERS.has(first) || !CLOSERS.has(last)) {
    return null;
  }
  const inner = trimmed.slice(1, -1).trim();
  // A closing quote in the middle means two separate quotations or speech plus a tag.
  if ([...inner].some((c) => CLOSERS.has(c) && c !== '"')) return null;
  if (inner.includes('"')) return null;
  return inner || null;
}

interface Piece {
  kind: 'action' | 'speech';
  text: string;
}

/** The scene's paragraphs as action and speech. Headings, rules and code are left out. */
function pieces(blocks: readonly ManuscriptBlock[]): Piece[] {
  const out: Piece[] = [];
  for (const block of blocks) {
    if (block.kind !== 'paragraph' && block.kind !== 'quote' && block.kind !== 'list') continue;
    const text = plain(block.runs);
    if (!text) continue;
    const speech = block.kind === 'paragraph' ? quotedLine(text) : null;
    out.push(speech ? { kind: 'speech', text: speech } : { kind: 'action', text });
  }
  return out;
}

const upper = (text: string) => text.toLocaleUpperCase('en-US');

/** A Fountain scene heading: the place and time, or the scene's title when it has neither. */
function slugline(scene: ScriptScene): string {
  if (scene.location) {
    const time = scene.date ? ` - ${upper(scene.date)}` : '';
    return `INT./EXT. ${upper(scene.location)}${time}`;
  }
  // A leading full stop makes any line a scene heading in Fountain.
  return `.${upper(scene.title)}`;
}

/** The manuscript as a Fountain screenplay outline. */
export function toFountain(input: ScriptInput): string {
  const lines: string[] = [`Title: ${input.title}`, `Author: ${input.author}`, '', '==='];
  for (const book of input.books) {
    if (input.books.length > 1) lines.push('', `# ${book.title}`);
    for (const chapter of book.chapters) {
      lines.push('', `## ${chapter.title}`);
      for (const scene of chapter.scenes) {
        const body = pieces(scene.blocks);
        if (body.length === 0) continue;
        lines.push('', slugline(scene));
        if (scene.summary) lines.push('', `= ${scene.summary.replace(/\s+/g, ' ')}`);
        if (scene.pov) lines.push('', `[[Told from ${scene.pov}'s point of view]]`);
        for (const piece of body) {
          if (piece.kind === 'action') lines.push('', piece.text);
          else lines.push('', '@SPEAKER', piece.text);
        }
      }
    }
  }
  return lines.join('\n') + '\n';
}

const PAGE_WORDS = ['ONE', 'TWO', 'THREE', 'FOUR', 'FIVE', 'SIX', 'SEVEN', 'EIGHT', 'NINE', 'TEN'];
const pageName = (n: number) => PAGE_WORDS[n - 1] ?? String(n);

/**
 * The manuscript as a comic script: a page for each scene, a panel for each stretch of action,
 * and speech as lines for a balloon with a SPEAKER to fill in.
 */
export function toComicScript(input: ScriptInput): string {
  const lines: string[] = [input.title.toUpperCase(), `Written by ${input.author}`];
  let page = 0;
  for (const book of input.books) {
    if (input.books.length > 1) lines.push('', `=== ${book.title.toUpperCase()} ===`);
    for (const chapter of book.chapters) {
      lines.push('', `--- ${chapter.title} ---`);
      for (const scene of chapter.scenes) {
        const body = pieces(scene.blocks);
        if (body.length === 0) continue;
        page++;
        lines.push('', `PAGE ${pageName(page)}`);
        const setting = [scene.location, scene.date].filter(Boolean).join(', ');
        lines.push(`(${scene.title}${setting ? `: ${setting}` : ''})`);
        if (scene.summary) lines.push(`(${scene.summary.replace(/\s+/g, ' ')})`);
        let panel = 0;
        for (const piece of body) {
          if (piece.kind === 'action') {
            panel++;
            lines.push('', `Panel ${panel}`, piece.text);
          } else {
            if (panel === 0) {
              panel++;
              lines.push('', `Panel ${panel}`);
            }
            lines.push(`SPEAKER: ${piece.text}`);
          }
        }
      }
    }
  }
  return lines.join('\n') + '\n';
}
