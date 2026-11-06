import PDFDocument from 'pdfkit';
import {
  blockWords,
  DEFAULT_CALENDAR,
  describeFieldValue,
  formatDate,
  richTextToBlocks,
  safeName,
  toWinAnsi,
  type ManuscriptBlock,
  type ManuscriptExportQuery,
  type ManuscriptNode,
  type RichTextDoc,
  type TextRun as Run,
  type WorldExport,
} from '@atlas/shared';
import type { DbOrTx } from '../../db/client';
import { badRequest } from '../../errors';
import { exportWorld } from './service';
import { loadManuscriptSource } from './manuscript-source';

type Doc = InstanceType<typeof PDFDocument>;
type Format = ManuscriptExportQuery['format'];

const PAPER = { letter: 'LETTER', a4: 'A4' } as const;
const INCH = 72;

/** Gathers the PDF as it is written; it resolves once `doc.end()` is called. */
function collect(doc: Doc): Promise<Buffer> {
  const chunks: Buffer[] = [];
  return new Promise((resolve, reject) => {
    doc.on('data', (chunk: Buffer) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
  });
}

const fontFor = (run: Run, family: 'Times' | 'Helvetica') => {
  if (run.code) return 'Courier';
  const style =
    run.bold && run.italic ? 'BoldOblique' : run.bold ? 'Bold' : run.italic ? 'Oblique' : '';
  if (family === 'Helvetica') return style ? `Helvetica-${style}` : 'Helvetica';
  const times =
    run.bold && run.italic ? 'BoldItalic' : run.bold ? 'Bold' : run.italic ? 'Italic' : 'Roman';
  return `Times-${times}`;
};

interface TextOptions {
  indent?: number;
  align?: 'left' | 'center' | 'right';
  lineGap?: number;
  paragraphGap?: number;
  width?: number;
}

/** One paragraph of styled runs, with the font changing as the style does. */
function writeRuns(
  doc: Doc,
  runs: Run[],
  options: TextOptions,
  family: 'Times' | 'Helvetica' = 'Times',
) {
  const pieces = runs.filter((run) => run.lineBreak || run.text !== '');
  if (pieces.length === 0) return;
  pieces.forEach((run, index) => {
    doc.font(fontFor(run, family));
    doc.text(run.lineBreak ? '\n' : toWinAnsi(run.text), {
      ...(index === 0 ? options : {}),
      continued: index < pieces.length - 1,
      underline: run.underline,
      strike: run.strike,
      link: run.link,
    });
  });
}

// ---- The manuscript -----------------------------------------------------------------------

const LOOKS = {
  manuscript: { size: 12, lineGap: 12, indent: 36, paragraphGap: 0, sceneBreak: '#' },
  clean: { size: 11.5, lineGap: 3.5, indent: 0, paragraphGap: 8, sceneBreak: '* * *' },
} as const;

function writeBlocks(doc: Doc, blocks: ManuscriptBlock[], format: Format, afterBreak: boolean) {
  const look = LOOKS[format];
  let first = afterBreak;
  doc.fontSize(look.size);
  for (const block of blocks) {
    switch (block.kind) {
      case 'paragraph':
        writeRuns(doc, block.runs, {
          indent: first ? 0 : look.indent,
          lineGap: look.lineGap,
          paragraphGap: look.paragraphGap,
        });
        first = false;
        break;
      case 'heading':
        doc.moveDown(0.5);
        writeRuns(
          doc,
          block.runs.map((run) => ({ ...run, bold: true })),
          { align: format === 'manuscript' ? 'center' : 'left', paragraphGap: 6 },
        );
        first = true;
        break;
      case 'quote':
        writeRuns(doc, block.runs, {
          indent: INCH / 2,
          width: doc.page.width - doc.page.margins.left - doc.page.margins.right - INCH / 2,
          lineGap: look.lineGap,
          paragraphGap: look.paragraphGap,
        });
        first = false;
        break;
      case 'code':
        doc
          .font('Courier')
          .fontSize(look.size - 1.5)
          .text(toWinAnsi(block.text), { paragraphGap: 6 });
        doc.fontSize(look.size);
        first = false;
        break;
      case 'list':
        writeRuns(doc, [{ text: block.ordered ? '- ' : '• ' }, ...block.runs], {
          indent: INCH / 4 + block.depth * (INCH / 4),
          lineGap: look.lineGap,
          paragraphGap: look.paragraphGap / 2,
        });
        first = false;
        break;
      case 'rule':
        doc.font('Times-Roman').text(look.sceneBreak, { align: 'center', paragraphGap: 6 });
        first = true;
        break;
    }
  }
}

interface BookText {
  title: string;
  words: number;
  render: (doc: Doc) => void;
}

function renderBookNode(
  doc: Doc | null,
  node: ManuscriptNode,
  children: Map<string | null, ManuscriptNode[]>,
  bodies: Map<string, RichTextDoc | null>,
  format: Format,
  state: { words: number },
) {
  const look = LOOKS[format];
  const kids = children.get(node.id) ?? [];
  if (doc && (node.kind === 'part' || node.kind === 'chapter')) {
    doc.addPage();
    // A manuscript chapter starts about a third of the way down the page.
    if (format === 'manuscript') doc.y = doc.page.margins.top + 160;
    doc.outline.addItem(toWinAnsi(node.title));
    doc
      .font('Times-Bold')
      .fontSize(look.size + (node.kind === 'part' ? 8 : 4))
      .text(toWinAnsi(node.title), {
        align: format === 'manuscript' ? 'center' : 'left',
        paragraphGap: 24,
      });
  }
  let firstScene = true;
  for (const kid of kids) {
    if (kid.kind === 'scene') {
      const blocks = richTextToBlocks(bodies.get(kid.id) ?? null);
      if (blocks.length === 0) continue;
      state.words += blockWords(blocks);
      if (doc) {
        if (!firstScene) {
          doc.font('Times-Roman').fontSize(look.size).moveDown(0.6);
          doc.text(look.sceneBreak, { align: 'center', paragraphGap: 10 });
        }
        writeBlocks(doc, blocks, format, true);
      }
      firstScene = false;
    } else {
      renderBookNode(doc, kid, children, bodies, format, state);
    }
  }
}

const roundedWords = (words: number) =>
  words < 1000 ? `${words}` : `about ${(Math.round(words / 100) * 100).toLocaleString('en-US')}`;

/** A book (or every book) of the manuscript as a PDF, in a submission layout or a clean one. */
export async function buildManuscriptPdf(
  db: DbOrTx,
  worldId: string,
  options: ManuscriptExportQuery & { author: string },
): Promise<{ filename: string; data: Buffer }> {
  const { worldName, children, bodies, chosen } = await loadManuscriptSource(
    db,
    worldId,
    options.bookId,
  );
  const author = options.author.trim() || 'Author';
  const look = LOOKS[options.format];

  const books: BookText[] = chosen.map((book) => {
    const state = { words: 0 };
    // A first pass counts the words without drawing, for the title page.
    renderBookNode(null, book, children, bodies, options.format, state);
    return {
      title: book.title,
      words: state.words,
      render: (doc) => renderBookNode(doc, book, children, bodies, options.format, { words: 0 }),
    };
  });
  if (books.every((b) => b.words === 0)) {
    throw badRequest('The manuscript has no text yet. Write a scene first.');
  }

  const title = chosen.length === 1 ? chosen[0]!.title : worldName;
  const doc = new PDFDocument({
    size: PAPER[options.paper],
    margins: { top: INCH, bottom: INCH, left: INCH, right: INCH },
    bufferPages: true,
    info: { Title: toWinAnsi(title), Author: toWinAnsi(author) },
  });
  const done = collect(doc);
  const startPages: number[] = [];

  books.forEach((book, index) => {
    if (index > 0) doc.addPage();
    startPages.push(doc.bufferedPageRange().count - 1);
    // Title page: author and length at the top, title and "by" in the middle.
    doc.font('Times-Roman').fontSize(look.size);
    const top = doc.y;
    doc.text(toWinAnsi(author), { continued: false });
    doc.text(`${roundedWords(book.words)} words`, doc.page.margins.left, top, { align: 'right' });
    doc.y = doc.page.height / 2 - 60;
    doc
      .font('Times-Bold')
      .fontSize(look.size + 12)
      .text(toWinAnsi(book.title.toUpperCase()), {
        align: 'center',
        paragraphGap: 14,
      });
    doc
      .font('Times-Roman')
      .fontSize(look.size + 2)
      .text(`by ${toWinAnsi(author)}`, { align: 'center' });
    doc.outline.addItem(toWinAnsi(book.title));
    book.render(doc);
  });

  // The running header on every page after a title page, and the page number counted from there.
  const range = doc.bufferedPageRange();
  const surname = author.trim().split(/\s+/).slice(-1)[0] ?? author;
  let bookIndex = -1;
  for (let i = 0; i < range.count; i++) {
    if (startPages.includes(i)) {
      bookIndex++;
      continue;
    }
    const base = startPages[bookIndex] ?? 0;
    const shortTitle = books[bookIndex]!.title;
    doc.switchToPage(i);
    const bottom = doc.page.margins.bottom;
    doc.page.margins.bottom = 0;
    doc.font('Times-Roman').fontSize(10);
    const label = `${surname} / ${shortTitle.length > 30 ? `${shortTitle.slice(0, 29)}...` : shortTitle} / ${i - base}`;
    doc.text(toWinAnsi(label), doc.page.margins.left, INCH / 2, {
      align: 'right',
      width: doc.page.width - doc.page.margins.left - doc.page.margins.right,
      lineBreak: false,
    });
    doc.page.margins.bottom = bottom;
  }
  doc.flushPages();
  doc.end();
  return { filename: `${safeName(title, 'manuscript')}.pdf`, data: await done };
}

// ---- The story bible ----------------------------------------------------------------------

const BIBLE = { body: 10.5, gap: 5 } as const;

function heading(doc: Doc, text: string, size: number, color = '#111827') {
  doc
    .font('Helvetica-Bold')
    .fontSize(size)
    .fillColor(color)
    .text(toWinAnsi(text), { paragraphGap: size / 3 });
  doc.fillColor('#111827');
}

function label(doc: Doc, name: string, value: string) {
  if (!value) return;
  doc
    .font('Helvetica-Bold')
    .fontSize(BIBLE.body)
    .text(`${toWinAnsi(name)}: `, { continued: true });
  doc.font('Times-Roman').text(toWinAnsi(value), { paragraphGap: 2 });
}

/** A lore article's text, in the same simple styles as the manuscript. */
function bibleBlocks(doc: Doc, blocks: ManuscriptBlock[]) {
  doc.fontSize(BIBLE.body);
  for (const block of blocks) {
    switch (block.kind) {
      case 'paragraph':
        writeRuns(doc, block.runs, { lineGap: 1.5, paragraphGap: BIBLE.gap });
        break;
      case 'heading':
        writeRuns(
          doc,
          block.runs.map((r) => ({ ...r, bold: true })),
          { paragraphGap: 3 },
          'Helvetica',
        );
        break;
      case 'quote':
        writeRuns(doc, block.runs, { indent: 18, lineGap: 1.5, paragraphGap: BIBLE.gap });
        break;
      case 'list':
        writeRuns(doc, [{ text: block.ordered ? '- ' : '• ' }, ...block.runs], {
          indent: 12 + block.depth * 12,
          paragraphGap: 2,
        });
        break;
      case 'code':
        doc.font('Courier').fontSize(9).text(toWinAnsi(block.text), { paragraphGap: BIBLE.gap });
        doc.fontSize(BIBLE.body);
        break;
      case 'rule':
        doc.moveDown(0.3);
        break;
    }
  }
}

/** Is there room for at least this much more on the page? Otherwise start a new one. */
function room(doc: Doc, height: number) {
  if (doc.y + height > doc.page.height - doc.page.margins.bottom) doc.addPage();
}

/**
 * The whole world as a printable reference: every entry by type with its details and notes, the
 * timeline, and an outline of the manuscript. It holds GM-only material, so it is for editors.
 */
export async function buildStoryBiblePdf(
  db: DbOrTx,
  worldId: string,
): Promise<{ filename: string; data: Buffer }> {
  const data: WorldExport = await exportWorld(db, worldId);
  const calendar = data.calendar?.definition ?? DEFAULT_CALENDAR;
  const when = (day: number) => formatDate(calendar, day);
  const names = new Map(data.entities.map((e) => [e.id, e.name]));
  const typeById = new Map(data.entityTypes.map((t) => [t.id, t]));
  const relType = new Map(data.relationshipTypes.map((t) => [t.id, t]));

  const doc = new PDFDocument({
    size: 'A4',
    margins: { top: 64, bottom: 64, left: 64, right: 64 },
    bufferPages: true,
    info: { Title: toWinAnsi(`${data.world.name}: story bible`) },
  });
  const done = collect(doc);

  // Cover.
  doc.y = doc.page.height / 3;
  doc
    .font('Helvetica-Bold')
    .fontSize(30)
    .text(toWinAnsi(data.world.name), { align: 'center', paragraphGap: 8 });
  doc
    .font('Helvetica')
    .fontSize(14)
    .fillColor('#6b7280')
    .text('Story bible', { align: 'center', paragraphGap: 16 });
  doc.fillColor('#111827');
  if (data.world.description) {
    doc
      .font('Times-Italic')
      .fontSize(12)
      .text(toWinAnsi(data.world.description), { align: 'center' });
  }
  doc
    .font('Helvetica')
    .fontSize(9)
    .fillColor('#6b7280')
    .text(`Made ${data.exportedAt.slice(0, 10)}`, 64, doc.page.height - 90, {
      align: 'center',
      width: doc.page.width - 128,
    });
  doc.fillColor('#111827');

  // Entries, by type.
  const relationships = data.relationships;
  for (const type of [...data.entityTypes].sort((a, b) => a.sortOrder - b.sortOrder)) {
    const entries = data.entities
      .filter((e) => e.typeId === type.id)
      .sort((a, b) => a.name.localeCompare(b.name));
    if (entries.length === 0) continue;
    doc.addPage();
    doc.outline.addItem(toWinAnsi(type.name));
    heading(doc, type.name, 22, type.color);
    doc
      .font('Helvetica')
      .fontSize(9)
      .fillColor('#6b7280')
      .text(`${entries.length} ${entries.length === 1 ? 'entry' : 'entries'}`, {
        paragraphGap: 14,
      });
    doc.fillColor('#111827');

    for (const entry of entries) {
      room(doc, 120);
      heading(doc, entry.name, 14);
      if (entry.aliases.length > 0) {
        doc
          .font('Times-Italic')
          .fontSize(BIBLE.body)
          .text(`Also known as ${toWinAnsi(entry.aliases.join(', '))}`, { paragraphGap: 3 });
      }
      if (entry.summary) {
        doc
          .font('Times-Roman')
          .fontSize(BIBLE.body + 0.5)
          .text(toWinAnsi(entry.summary), { paragraphGap: 4 });
      }
      if (entry.startDay !== null) label(doc, type.startLabel, when(entry.startDay));
      if (entry.endDay !== null) label(doc, type.endLabel, when(entry.endDay));
      for (const field of type.fieldSchema) {
        label(doc, field.label, describeFieldValue(entry.fields[field.key]));
      }
      const related = relationships
        .filter((r) => r.sourceId === entry.id || r.targetId === entry.id)
        .map((r) => {
          const kind = relType.get(r.typeId);
          const outgoing = r.sourceId === entry.id;
          const other = names.get(outgoing ? r.targetId : r.sourceId) ?? 'Unknown';
          return `${outgoing ? kind?.label : kind?.inverseLabel} ${other}`;
        });
      label(doc, 'Connections', related.join('; '));
      doc.moveDown(0.3);
      bibleBlocks(doc, richTextToBlocks(entry.body));
      doc.moveDown(0.8);
    }
  }

  // The timeline.
  const dated = data.entities
    .filter((e) => e.startDay !== null || e.endDay !== null)
    .map((e) => ({ entry: e, day: (e.startDay ?? e.endDay)!, type: typeById.get(e.typeId) }))
    .sort((a, b) => a.day - b.day || a.entry.name.localeCompare(b.entry.name));
  if (dated.length > 0) {
    doc.addPage();
    doc.outline.addItem('Timeline');
    heading(doc, 'Timeline', 22);
    for (const { entry, day, type } of dated) {
      room(doc, 20);
      const what = entry.startDay === null ? type?.endLabel : type?.startLabel;
      doc
        .font('Helvetica')
        .fontSize(BIBLE.body)
        .text(toWinAnsi(when(day)), { continued: true, width: 400 });
      doc.font('Helvetica-Bold').text(`   ${toWinAnsi(entry.name)}`, { continued: true });
      doc.font('Times-Italic').text(`  ${toWinAnsi(what ?? '')}`, { paragraphGap: 2 });
    }
  }

  // The manuscript, as an outline of what each scene is about.
  const books = data.manuscript.filter((n) => n.kind === 'book');
  if (books.length > 0) {
    doc.addPage();
    doc.outline.addItem('Manuscript outline');
    heading(doc, 'Manuscript outline', 22);
    const byParent = new Map<string | null, typeof data.manuscript>();
    for (const node of data.manuscript) {
      byParent.set(node.parentId, [...(byParent.get(node.parentId) ?? []), node]);
    }
    const walk = (parent: string | null, depth: number) => {
      for (const node of (byParent.get(parent) ?? []).sort((a, b) => a.sortOrder - b.sortOrder)) {
        room(doc, 28);
        const size = node.kind === 'book' ? 15 : node.kind === 'scene' ? BIBLE.body : 12;
        doc.font(node.kind === 'scene' ? 'Times-Roman' : 'Helvetica-Bold').fontSize(size);
        doc.text(toWinAnsi(node.title), doc.page.margins.left + depth * 14, undefined, {
          paragraphGap: node.summary ? 0 : 2,
        });
        if (node.summary) {
          doc
            .font('Times-Italic')
            .fontSize(BIBLE.body - 0.5)
            .fillColor('#4b5563')
            .text(toWinAnsi(node.summary), doc.page.margins.left + depth * 14, undefined, {
              paragraphGap: 4,
            });
          doc.fillColor('#111827');
        }
        walk(node.id, depth + 1);
      }
    };
    walk(null, 0);
  }

  // Page numbers along the bottom of every page after the cover.
  const range = doc.bufferedPageRange();
  for (let i = 1; i < range.count; i++) {
    doc.switchToPage(i);
    const bottom = doc.page.margins.bottom;
    doc.page.margins.bottom = 0;
    doc
      .font('Helvetica')
      .fontSize(9)
      .fillColor('#6b7280')
      .text(String(i), 0, doc.page.height - 40, {
        align: 'center',
        width: doc.page.width,
        lineBreak: false,
      });
    doc.page.margins.bottom = bottom;
  }
  doc.flushPages();
  doc.end();
  return { filename: `${safeName(data.world.name, 'world')}-story-bible.pdf`, data: await done };
}
