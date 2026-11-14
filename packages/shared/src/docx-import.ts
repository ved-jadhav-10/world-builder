/*
 * Reading a Word document (.docx, which is also what Google Docs gives when you download one as
 * Word) into Markdown notes the Markdown importer already understands. A .docx is a zip; the
 * browser unzips it and hands the three parts that matter to this file as text:
 *   word/document.xml           the text, with its headings, lists, bold and italic
 *   word/_rels/document.xml.rels  where each link goes
 *   word/numbering.xml          whether a list is bulleted or numbered
 * Nothing here needs a DOM, so it runs the same in tests, the browser and the server.
 */

export interface DocxParts {
  document: string;
  rels?: string | undefined;
  numbering?: string | undefined;
}

/** How to cut a document into entries. */
export type DocxSplit = 'auto' | 'none' | 1 | 2 | 3;

export interface DocxNote {
  path: string;
  content: string;
}

const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };

function decode(text: string): string {
  return text.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (whole, code: string) => {
    if (code.startsWith('#x')) return String.fromCodePoint(parseInt(code.slice(2), 16));
    if (code.startsWith('#')) return String.fromCodePoint(parseInt(code.slice(1), 10));
    return ENTITIES[code.toLowerCase()] ?? whole;
  });
}

/** Where each relationship ID (a link's address) points. */
function readRels(xml: string | undefined): Map<string, string> {
  const rels = new Map<string, string>();
  if (!xml) return rels;
  for (const tag of xml.matchAll(/<Relationship\b[^>]*>/g)) {
    const id = /\bId="([^"]*)"/.exec(tag[0])?.[1];
    const target = /\bTarget="([^"]*)"/.exec(tag[0])?.[1];
    if (id && target && /\bTargetMode="External"/.test(tag[0])) rels.set(id, decode(target));
  }
  return rels;
}

/** For each list ID, whether its first level is a bulleted list (true) or a numbered one. */
function readNumbering(xml: string | undefined): Map<string, boolean> {
  const bulleted = new Map<string, boolean>();
  if (!xml) return bulleted;
  const abstracts = new Map<string, boolean>();
  for (const abstract of xml.matchAll(
    /<w:abstractNum\b[^>]*w:abstractNumId="(\d+)"[^>]*>([\s\S]*?)<\/w:abstractNum>/g,
  )) {
    const first = /<w:lvl\b[^>]*w:ilvl="0"[^>]*>([\s\S]*?)<\/w:lvl>/.exec(abstract[2]!);
    const format = first ? /<w:numFmt\b[^>]*w:val="([^"]*)"/.exec(first[1]!)?.[1] : undefined;
    abstracts.set(abstract[1]!, format === 'bullet' || format === 'none');
  }
  for (const num of xml.matchAll(/<w:num\b[^>]*w:numId="(\d+)"[^>]*>([\s\S]*?)<\/w:num>/g)) {
    const abstractId = /<w:abstractNumId\b[^>]*w:val="(\d+)"/.exec(num[2]!)?.[1];
    if (abstractId !== undefined) bulleted.set(num[1]!, abstracts.get(abstractId) ?? true);
  }
  return bulleted;
}

interface Piece {
  text: string;
  bold: boolean;
  italic: boolean;
  href?: string;
}

/** A run's switches. `<w:b/>` is on; `<w:b w:val="0"/>` and "false" are off. */
function switchOn(properties: string, tag: string): boolean {
  const found = new RegExp(`<w:${tag}\\b([^>]*)/?>`).exec(properties);
  if (!found) return false;
  const value = /w:val="([^"]*)"/.exec(found[1]!)?.[1];
  return value === undefined || !['0', 'false', 'off', 'none'].includes(value);
}

function readPieces(inner: string, rels: Map<string, string>): Piece[] {
  const pieces: Piece[] = [];
  const addRun = (run: string, href?: string) => {
    const properties = /<w:rPr>([\s\S]*?)<\/w:rPr>/.exec(run)?.[1] ?? '';
    let text = '';
    for (const part of run.matchAll(
      /<w:t(?:\s[^>]*)?>([^<]*)<\/w:t>|<w:tab\s*\/>|<w:br\b[^>]*\/>/g,
    )) {
      text += part[1] !== undefined ? decode(part[1]) : ' ';
    }
    if (!text) return;
    pieces.push({
      text,
      bold: switchOn(properties, 'b'),
      italic: switchOn(properties, 'i'),
      ...(href ? { href } : {}),
    });
  };
  const pattern =
    /<w:hyperlink\b([^>]*)>([\s\S]*?)<\/w:hyperlink>|<w:r(?:\s[^>]*)?>([\s\S]*?)<\/w:r>/g;
  for (const match of inner.matchAll(pattern)) {
    if (match[2] !== undefined) {
      const id = /\br:id="([^"]*)"/.exec(match[1]!)?.[1];
      const href = id ? rels.get(id) : undefined;
      for (const run of match[2].matchAll(/<w:r(?:\s[^>]*)?>([\s\S]*?)<\/w:r>/g)) {
        addRun(run[1]!, href && /^https?:\/\//i.test(href) ? href : undefined);
      }
    } else {
      addRun(match[3]!);
    }
  }
  return pieces;
}

/** Runs to Markdown. Neighbours that look the same are joined, so `**a****b**` never happens. */
function inlineMarkdown(pieces: Piece[], plain: boolean): string {
  const merged: Piece[] = [];
  for (const piece of pieces) {
    const last = merged.at(-1);
    if (
      last &&
      last.bold === piece.bold &&
      last.italic === piece.italic &&
      last.href === piece.href
    ) {
      last.text += piece.text;
    } else {
      merged.push({ ...piece });
    }
  }
  return merged
    .map((piece) => {
      if (plain) return piece.text;
      const [, lead = '', core = '', trail = ''] = /^(\s*)([\s\S]*?)(\s*)$/.exec(piece.text)!;
      if (!core) return piece.text;
      // The marks go round the words, not the spaces beside them: "a **b** c", not "a** b **c".
      let marked = core;
      if (piece.href) marked = `[${marked}](${piece.href})`;
      if (piece.bold) marked = `**${marked}**`;
      else if (piece.italic) marked = `*${marked}*`;
      return `${lead}${marked}${trail}`;
    })
    .join('');
}

const tidy = (text: string) => text.replace(/[ \t]+/g, ' ').trim();

/** The document as Markdown: headings, paragraphs, lists, bold, italic and links. */
export function docxToMarkdown(parts: DocxParts): string {
  const rels = readRels(parts.rels);
  const bulleted = readNumbering(parts.numbering);
  const out: string[] = [];
  let previousWasList = false;

  const body = /<w:body>([\s\S]*)<\/w:body>/.exec(parts.document)?.[1] ?? parts.document;

  /** A paragraph's own properties: its heading level, its list. */
  const describe = (paragraph: string) => {
    const properties = /<w:pPr>([\s\S]*?)<\/w:pPr>/.exec(paragraph)?.[1] ?? '';
    const style = /<w:pStyle\b[^>]*w:val="([^"]*)"/.exec(properties)?.[1] ?? '';
    const heading =
      /^Heading([1-6])$/i.exec(style.replace(/\s+/g, ''))?.[1] ??
      (/^Title$/i.test(style) ? '1' : undefined);
    const numId = /<w:numId\b[^>]*w:val="(\d+)"/.exec(properties)?.[1];
    const level = Number(/<w:ilvl\b[^>]*w:val="(\d+)"/.exec(properties)?.[1] ?? 0);
    const listStyle = /^List(Bullet|Number|Paragraph)/i.exec(style.replace(/\s+/g, ''));
    return { heading: heading ? Number(heading) : null, numId, level, listStyle };
  };

  const emit = (paragraph: string) => {
    const inner = paragraph.replace(/<w:pPr>[\s\S]*?<\/w:pPr>/, '');
    const { heading, numId, level, listStyle } = describe(paragraph);
    const pieces = readPieces(inner, rels);
    if (!pieces.some((piece) => piece.text.trim())) return;
    if (heading) {
      out.push('', `${'#'.repeat(heading)} ${tidy(inlineMarkdown(pieces, true))}`, '');
      previousWasList = false;
      return;
    }
    const text = tidy(inlineMarkdown(pieces, false));
    if (numId !== undefined && numId !== '0') {
      const bullet = bulleted.get(numId) ?? true;
      if (!previousWasList) out.push('');
      out.push(`${'  '.repeat(Math.min(level, 4))}${bullet ? '-' : '1.'} ${text}`);
      previousWasList = true;
      return;
    }
    if (listStyle) {
      if (!previousWasList) out.push('');
      out.push(`${/^Number/i.test(listStyle[1]!) ? '1.' : '-'} ${text}`);
      previousWasList = true;
      return;
    }
    out.push('', text, '');
    previousWasList = false;
  };

  // Tables become one bulleted line per row, cells divided by " | ", so nothing in them is lost.
  const blocks = body.matchAll(/<w:tbl\b[\s\S]*?<\/w:tbl>|<w:p(?:\s[^>]*)?>[\s\S]*?<\/w:p>/g);
  for (const block of blocks) {
    const source = block[0];
    if (source.startsWith('<w:tbl')) {
      out.push('');
      for (const row of source.matchAll(/<w:tr\b[\s\S]*?<\/w:tr>/g)) {
        const cells = [...row[0].matchAll(/<w:tc\b[\s\S]*?<\/w:tc>/g)]
          .map((cell) =>
            tidy(
              [...cell[0].matchAll(/<w:p(?:\s[^>]*)?>[\s\S]*?<\/w:p>/g)]
                .map((p) => inlineMarkdown(readPieces(p[0], rels), true))
                .join(' '),
            ),
          )
          .filter(Boolean);
        if (cells.length) out.push(`- ${cells.join(' | ')}`);
      }
      out.push('');
      previousWasList = false;
    } else {
      emit(source);
    }
  }
  return out
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

const safeTitle = (title: string) =>
  title
    .replace(/[\\/]+/g, '-')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 200);

/**
 * One document, cut into notes. "auto" cuts at Heading 1 when the document has several; when it
 * has one (a title) it cuts at Heading 2 instead; with neither it stays whole. Whatever comes
 * before the first heading becomes a note named after the document itself.
 *
 * The file's own name stands in for a folder, so a document called "Characters.docx" fills the
 * Characters type, the way a folder of that name would.
 */
export function docxToNotes(fileName: string, parts: DocxParts, split: DocxSplit = 'auto') {
  const document = fileName.replace(/\.docx$/i, '').trim() || 'Untitled';
  const markdown = docxToMarkdown(parts);
  if (!markdown) return [];
  const lines = markdown.split('\n');
  const count = (level: number) =>
    lines.filter((line) => line.startsWith(`${'#'.repeat(level)} `)).length;

  let level: number | null;
  if (split === 'none') level = null;
  else if (split === 'auto') level = count(1) >= 2 ? 1 : count(2) >= 1 ? 2 : null;
  else level = count(split) >= 1 ? split : null;

  const notes: DocxNote[] = [];
  const whole = () =>
    notes.push({ path: `${safeTitle(document)}/${safeTitle(document)}.md`, content: markdown });
  if (level === null) {
    whole();
    return notes;
  }

  const marker = `${'#'.repeat(level)} `;
  let title: string | null = null;
  let current: string[] = [];
  const finish = () => {
    const text = current.join('\n').trim();
    if (title !== null) {
      const name = safeTitle(title);
      if (name)
        notes.push({ path: `${safeTitle(document)}/${name}.md`, content: `# ${name}\n\n${text}` });
    } else if (text) {
      // With a lone title at the top, the title is the document's name, not part of its text.
      const intro = level === 2 ? text.replace(/^# .*\n?/, '').trim() : text;
      if (intro) {
        notes.push({ path: `${safeTitle(document)}/${safeTitle(document)}.md`, content: intro });
      }
    }
    current = [];
  };
  for (const line of lines) {
    if (line.startsWith(marker)) {
      finish();
      title = line.slice(marker.length);
    } else {
      current.push(line);
    }
  }
  finish();
  return notes;
}
