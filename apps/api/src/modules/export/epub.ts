import { strToU8, zipSync, type Zippable } from 'fflate';
import {
  blocksToXhtml,
  blockWords,
  escapeXml,
  richTextToBlocks,
  safeName,
  type ManuscriptNode,
  type RichTextDoc,
} from '@atlas/shared';
import type { DbOrTx } from '../../db/client';
import { badRequest } from '../../errors';
import { loadManuscriptSource } from './manuscript-source';

const XHTML_HEAD = `<?xml version="1.0" encoding="utf-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" xml:lang="en" lang="en">`;

const page = (title: string, body: string) =>
  `${XHTML_HEAD}
<head>
<meta charset="utf-8" />
<title>${escapeXml(title)}</title>
<link rel="stylesheet" type="text/css" href="style.css" />
</head>
<body>
${body}
</body>
</html>
`;

const STYLE = `body { font-family: serif; line-height: 1.5; margin: 0 5%; }
h1, h2 { text-align: center; font-weight: bold; }
h1 { font-size: 1.8em; margin: 3em 0 1em; }
h2 { font-size: 1.4em; margin: 3em 0 1.5em; page-break-before: always; }
h3, h4, h5 { margin: 1.5em 0 0.5em; }
p { margin: 0; text-indent: 1.4em; text-align: justify; }
h1 + p, h2 + p, h3 + p, p.break + p, hr + p, blockquote + p { text-indent: 0; }
p.break { text-align: center; text-indent: 0; margin: 1.2em 0; }
p.titlepage { text-align: center; text-indent: 0; }
p.author { margin-top: 1.5em; font-size: 1.1em; }
blockquote { margin: 1em 2em; }
blockquote p { text-indent: 0; }
pre { white-space: pre-wrap; font-size: 0.9em; }
ul, ol { margin: 0.8em 0; }
`;

interface Chapter {
  /** File name inside the book. */
  file: string;
  title: string;
  /** 1 for a part, 2 for a chapter; the table of contents indents chapters under parts. */
  level: 1 | 2;
  html: string;
}

/** The chapters (and part openers) under a book, in reading order. */
function collectChapters(
  node: ManuscriptNode,
  children: Map<string | null, ManuscriptNode[]>,
  bodies: Map<string, RichTextDoc | null>,
  chapters: Chapter[],
  state: { words: number },
) {
  for (const kid of children.get(node.id) ?? []) {
    if (kid.kind === 'part') {
      chapters.push({
        file: `part-${chapters.length + 1}.xhtml`,
        title: kid.title,
        level: 1,
        html: `<h1>${escapeXml(kid.title)}</h1>`,
      });
      collectChapters(kid, children, bodies, chapters, state);
    } else if (kid.kind === 'chapter') {
      const scenes = (children.get(kid.id) ?? [])
        .filter((s) => s.kind === 'scene')
        .map((s) => richTextToBlocks(bodies.get(s.id) ?? null))
        .filter((blocks) => blocks.length > 0);
      for (const blocks of scenes) state.words += blockWords(blocks);
      chapters.push({
        file: `chapter-${chapters.length + 1}.xhtml`,
        title: kid.title,
        level: 2,
        html: `<h2>${escapeXml(kid.title)}</h2>\n${scenes
          .map((blocks) => blocksToXhtml(blocks))
          .join('\n<p class="break">* * *</p>\n')}`,
      });
    }
  }
}

/**
 * A book (or all of them, one after another) as an EPUB 3 file: a title page, a table of
 * contents, and one page per chapter. Built by hand as a zip so no extra library is needed.
 */
export async function buildManuscriptEpub(
  db: DbOrTx,
  worldId: string,
  options: { bookId?: string; author: string },
): Promise<{ filename: string; data: Uint8Array }> {
  const { worldName, children, bodies, chosen } = await loadManuscriptSource(
    db,
    worldId,
    options.bookId,
  );

  const author = options.author.trim() || 'Author';
  const title = chosen.length === 1 ? chosen[0]!.title : worldName;
  const chapters: Chapter[] = [];
  const state = { words: 0 };
  for (const book of chosen) {
    if (chosen.length > 1) {
      chapters.push({
        file: `book-${chapters.length + 1}.xhtml`,
        title: book.title,
        level: 1,
        html: `<h1>${escapeXml(book.title)}</h1>`,
      });
    }
    collectChapters(book, children, bodies, chapters, state);
  }
  if (state.words === 0) throw badRequest('The manuscript has no text yet. Write a scene first.');

  const identifier = `urn:uuid:${chosen.length === 1 ? chosen[0]!.id : worldId}`;
  const modified = new Date().toISOString().replace(/\.\d{3}Z$/, 'Z');

  const files: Zippable = {
    // The mimetype entry must come first and be stored without compression.
    mimetype: [strToU8('application/epub+zip'), { level: 0 }],
    'META-INF/container.xml': strToU8(`<?xml version="1.0" encoding="utf-8"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
<rootfiles><rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml" /></rootfiles>
</container>
`),
    'OEBPS/style.css': strToU8(STYLE),
    'OEBPS/title.xhtml': strToU8(
      page(
        title,
        `<h1 style="margin-top: 30%">${escapeXml(title)}</h1>\n<p class="titlepage author">by ${escapeXml(author)}</p>`,
      ),
    ),
    'OEBPS/nav.xhtml': strToU8(
      page(
        'Contents',
        `<nav epub:type="toc" id="toc"><h1>Contents</h1>\n<ol>\n${chapters
          .map(
            (c) =>
              `<li${c.level === 2 ? ' style="margin-left: 1.5em"' : ''}><a href="${c.file}">${escapeXml(c.title)}</a></li>`,
          )
          .join('\n')}\n</ol></nav>`,
      ),
    ),
  };
  for (const chapter of chapters) {
    files[`OEBPS/${chapter.file}`] = strToU8(page(chapter.title, chapter.html));
  }
  const manifest = [
    '<item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav" />',
    '<item id="css" href="style.css" media-type="text/css" />',
    '<item id="title" href="title.xhtml" media-type="application/xhtml+xml" />',
    ...chapters.map(
      (c, i) => `<item id="c${i}" href="${c.file}" media-type="application/xhtml+xml" />`,
    ),
  ];
  const spine = [
    '<itemref idref="title" />',
    ...chapters.map((_, i) => `<itemref idref="c${i}" />`),
  ];
  files['OEBPS/content.opf'] = strToU8(`<?xml version="1.0" encoding="utf-8"?>
<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="book-id" xml:lang="en">
<metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
<dc:identifier id="book-id">${escapeXml(identifier)}</dc:identifier>
<dc:title>${escapeXml(title)}</dc:title>
<dc:creator>${escapeXml(author)}</dc:creator>
<dc:language>en</dc:language>
<meta property="dcterms:modified">${modified}</meta>
</metadata>
<manifest>
${manifest.join('\n')}
</manifest>
<spine>
${spine.join('\n')}
</spine>
</package>
`);

  return { filename: `${safeName(title, 'manuscript')}.epub`, data: zipSync(files) };
}
