import {
  AlignmentType,
  Document,
  ExternalHyperlink,
  Header,
  HeadingLevel,
  LevelFormat,
  Packer,
  PageNumber,
  Paragraph,
  TabStopType,
  TextRun,
  type ISectionOptions,
} from 'docx';
import {
  blockWords,
  richTextToBlocks,
  safeName,
  type ManuscriptBlock,
  type ManuscriptExportQuery,
  type ManuscriptNode,
  type RichTextDoc,
  type TextRun as Run,
} from '@atlas/shared';
import type { DbOrTx } from '../../db/client';
import { badRequest, notFound } from '../../errors';
import { getSceneBodies, listTree } from '../manuscript/service';
import { worlds } from '../../db/schema';
import { eq } from 'drizzle-orm';

type Format = ManuscriptExportQuery['format'];

/** The look of each format. Sizes are in half-points and twips (a twentieth of a point). */
const STYLES = {
  manuscript: {
    font: 'Times New Roman',
    size: 24,
    line: 480,
    firstLine: 720,
    spaceAfter: 0,
    sceneBreak: '#',
  },
  clean: {
    font: 'Cambria',
    size: 23,
    line: 300,
    firstLine: 0,
    spaceAfter: 160,
    sceneBreak: '* * *',
  },
} as const;

const PAPER = {
  letter: { width: 12240, height: 15840 },
  a4: { width: 11906, height: 16838 },
} as const;

/** One inch, in twips. */
const INCH = 1440;

const NUMBERING = 'ms-numbered';

function runsToDocx(runs: Run[], font: string, sizeOverride?: number) {
  return runs.map((run) => {
    if (run.lineBreak) return new TextRun({ break: 1 });
    const text = new TextRun({
      text: run.text,
      bold: run.bold,
      italics: run.italic,
      underline: run.underline ? {} : undefined,
      strike: run.strike,
      font: run.code ? 'Courier New' : font,
      size: sizeOverride,
      style: run.link ? 'Hyperlink' : undefined,
    });
    return run.link ? new ExternalHyperlink({ link: run.link, children: [text] }) : text;
  });
}

/** The paragraphs of a scene's text in the chosen format. */
function blocksToParagraphs(
  blocks: ManuscriptBlock[],
  format: Format,
  startsAfterBreak: boolean,
): Paragraph[] {
  const look = STYLES[format];
  const out: Paragraph[] = [];
  // By convention the first paragraph after a heading or a scene break is not indented.
  let afterBreak = startsAfterBreak;
  for (const block of blocks) {
    switch (block.kind) {
      case 'paragraph':
        out.push(
          new Paragraph({
            children: runsToDocx(block.runs, look.font),
            alignment: AlignmentType.LEFT,
            indent: { firstLine: afterBreak ? 0 : look.firstLine },
            spacing: { line: look.line, after: look.spaceAfter },
          }),
        );
        afterBreak = false;
        break;
      case 'heading':
        out.push(
          new Paragraph({
            children: runsToDocx(
              block.runs.map((r) => ({ ...r, bold: true })),
              look.font,
            ),
            heading: format === 'clean' ? HeadingLevel.HEADING_3 : undefined,
            alignment: format === 'manuscript' ? AlignmentType.CENTER : AlignmentType.LEFT,
            keepNext: true,
            spacing: { before: 240, after: 240, line: look.line },
          }),
        );
        afterBreak = true;
        break;
      case 'quote':
        out.push(
          new Paragraph({
            children: runsToDocx(block.runs, look.font),
            indent: { left: INCH / 2, right: INCH / 2 },
            spacing: { line: look.line, after: look.spaceAfter },
          }),
        );
        afterBreak = false;
        break;
      case 'code':
        out.push(
          new Paragraph({
            children: block.text
              .split('\n')
              .flatMap((line, i) => [
                ...(i > 0 ? [new TextRun({ break: 1 })] : []),
                new TextRun({ text: line, font: 'Courier New', size: 20 }),
              ]),
            spacing: { line: 276, after: 160 },
          }),
        );
        afterBreak = false;
        break;
      case 'list': {
        const children = runsToDocx(block.runs, look.font);
        out.push(
          block.ordered
            ? new Paragraph({
                children,
                numbering: { reference: NUMBERING, level: Math.min(block.depth, 2) },
                spacing: { line: look.line, after: look.spaceAfter },
              })
            : new Paragraph({
                children,
                bullet: { level: Math.min(block.depth, 2) },
                spacing: { line: look.line, after: look.spaceAfter },
              }),
        );
        afterBreak = false;
        break;
      }
      case 'rule':
        out.push(sceneBreak(format));
        afterBreak = true;
        break;
    }
  }
  return out;
}

function sceneBreak(format: Format): Paragraph {
  const look = STYLES[format];
  return new Paragraph({
    children: [new TextRun({ text: look.sceneBreak, font: look.font })],
    alignment: AlignmentType.CENTER,
    spacing: { before: 240, after: 240, line: look.line },
    keepNext: true,
  });
}

function headingParagraph(title: string, format: Format, kind: 'part' | 'chapter'): Paragraph {
  const look = STYLES[format];
  const manuscript = format === 'manuscript';
  return new Paragraph({
    children: [
      new TextRun({
        text: title,
        bold: true,
        font: look.font,
        size: kind === 'part' ? look.size + 8 : look.size + 4,
      }),
    ],
    heading: kind === 'part' ? HeadingLevel.HEADING_1 : HeadingLevel.HEADING_2,
    alignment: manuscript ? AlignmentType.CENTER : AlignmentType.LEFT,
    pageBreakBefore: true,
    // A manuscript chapter starts about a third of the way down the page.
    spacing: { before: manuscript ? 2880 : 0, after: manuscript ? 720 : 360 },
  });
}

interface BookParts {
  title: string;
  paragraphs: Paragraph[];
  words: number;
}

/** Everything under a book (or part) as paragraphs, in reading order. */
function renderNode(
  node: ManuscriptNode,
  children: Map<string | null, ManuscriptNode[]>,
  bodies: Map<string, RichTextDoc | null>,
  format: Format,
  state: { words: number },
): Paragraph[] {
  const out: Paragraph[] = [];
  const kids = children.get(node.id) ?? [];
  if (node.kind === 'part' || node.kind === 'chapter') {
    out.push(headingParagraph(node.title, format, node.kind));
  }
  let firstScene = true;
  for (const kid of kids) {
    if (kid.kind === 'scene') {
      const blocks = richTextToBlocks(bodies.get(kid.id) ?? null);
      if (blocks.length === 0) continue;
      state.words += blockWords(blocks);
      if (!firstScene) out.push(sceneBreak(format));
      out.push(...blocksToParagraphs(blocks, format, true));
      firstScene = false;
    } else {
      out.push(...renderNode(kid, children, bodies, format, state));
    }
  }
  return out;
}

const roundedWords = (words: number) =>
  words < 1000 ? `${words}` : `about ${(Math.round(words / 100) * 100).toLocaleString('en-US')}`;

/** The first page of a book: author and length at the top, title and "by" in the middle. */
function titlePage(title: string, author: string, words: number, format: Format): Paragraph[] {
  const look = STYLES[format];
  const text = (value: string, extra: { bold?: boolean; size?: number } = {}) =>
    new TextRun({ text: value, font: look.font, ...extra });
  return [
    new Paragraph({
      children: [text(author), new TextRun({ text: '\t' }), text(`${roundedWords(words)} words`)],
      tabStops: [{ type: TabStopType.RIGHT, position: 6 * INCH + INCH / 2 }],
    }),
    new Paragraph({
      children: [text(title.toUpperCase(), { bold: true, size: look.size + 12 })],
      alignment: AlignmentType.CENTER,
      spacing: { before: 3 * INCH, after: 240 },
    }),
    new Paragraph({
      children: [text(`by ${author}`, { size: look.size + 2 })],
      alignment: AlignmentType.CENTER,
    }),
  ];
}

function bookSections(
  book: BookParts,
  author: string,
  format: Format,
  paper: keyof typeof PAPER,
): ISectionOptions[] {
  const look = STYLES[format];
  const page = {
    size: PAPER[paper],
    margin: { top: INCH, bottom: INCH, left: INCH, right: INCH },
  };
  const shortTitle = book.title.length > 30 ? `${book.title.slice(0, 29)}…` : book.title;
  const surname = author.trim().split(/\s+/).slice(-1)[0] ?? author;
  return [
    { properties: { page }, children: titlePage(book.title, author, book.words, format) },
    {
      properties: { page: { ...page, pageNumbers: { start: 1 } } },
      headers: {
        default: new Header({
          children: [
            new Paragraph({
              alignment: AlignmentType.RIGHT,
              children: [
                new TextRun({
                  children: [`${surname} / ${shortTitle} / `, PageNumber.CURRENT],
                  font: look.font,
                  size: 20,
                }),
              ],
            }),
          ],
        }),
      },
      children: book.paragraphs.length > 0 ? book.paragraphs : [new Paragraph({})],
    },
  ];
}

/**
 * A book (or every book) of the manuscript as a Word document. "manuscript" follows the usual
 * format for submitting fiction: 12 pt serif, double spaced, indented paragraphs, a title page
 * and a running header; "clean" is a comfortable reading layout.
 */
export async function buildManuscriptDocx(
  db: DbOrTx,
  worldId: string,
  options: ManuscriptExportQuery & { author: string },
): Promise<{ filename: string; data: Buffer }> {
  const [world] = await db.select().from(worlds).where(eq(worlds.id, worldId));
  if (!world) throw notFound('World');
  const tree = await listTree(db, worldId);
  const bodies = await getSceneBodies(db, worldId);
  const children = new Map<string | null, ManuscriptNode[]>();
  for (const node of tree) {
    children.set(node.parentId, [...(children.get(node.parentId) ?? []), node]);
  }
  const books = (children.get(null) ?? []).filter((n) => n.kind === 'book');
  const chosen = options.bookId ? books.filter((b) => b.id === options.bookId) : books;
  if (options.bookId && chosen.length === 0) throw notFound('Book');
  if (chosen.length === 0) throw badRequest('There is no manuscript to export yet.');

  const author = options.author.trim() || 'Author';
  const parts: BookParts[] = chosen.map((book) => {
    const state = { words: 0 };
    const paragraphs = renderNode(book, children, bodies, options.format, state);
    return { title: book.title, paragraphs, words: state.words };
  });
  if (parts.every((p) => p.words === 0)) {
    throw badRequest('The manuscript has no text yet. Write a scene first.');
  }

  const look = STYLES[options.format];
  const doc = new Document({
    creator: author,
    title: chosen.length === 1 ? chosen[0]!.title : world.name,
    styles: {
      default: {
        document: { run: { font: look.font, size: look.size } },
      },
    },
    numbering: {
      config: [
        {
          reference: NUMBERING,
          levels: [0, 1, 2].map((level) => ({
            level,
            format: LevelFormat.DECIMAL,
            text: `%${level + 1}.`,
            alignment: AlignmentType.START,
            style: { paragraph: { indent: { left: 720 * (level + 1), hanging: 360 } } },
          })),
        },
      ],
    },
    sections: parts.flatMap((book) => bookSections(book, author, options.format, options.paper)),
  });
  const data = await Packer.toBuffer(doc);
  const name = chosen.length === 1 ? chosen[0]!.title : world.name;
  return { filename: `${safeName(name, 'manuscript')}.docx`, data };
}
