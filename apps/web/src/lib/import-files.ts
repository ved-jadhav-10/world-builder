import type * as Fflate from 'fflate';
import {
  docxToNotes,
  looksLikeNotion,
  notionToNotes,
  type DocxParts,
  type DocxSplit,
  type NotionFile,
} from '@atlas/shared';

/*
 * Reading what a person picked for import, in the browser, into Markdown notes. Markdown and text
 * files are read as they are; a Word document (or a Google Doc downloaded as Word) is read by
 * docx-import; a .zip is opened, and if it is a Notion export it is read by notion-import, else
 * its notes are taken as a folder of Markdown (an Obsidian vault, zipped). Nothing is uploaded
 * except the finished notes, so the server never has to unpack anything.
 */

export interface ImportNote {
  path: string;
  content: string;
}

export interface ImportRead {
  notes: ImportNote[];
  /** How many notes came from each kind of source. */
  from: { markdown: number; notion: number; word: number };
  /** Files that were not notes, with the reason, for the report. */
  ignored: string[];
}

const NOTE = /\.(md|markdown|txt)$/i;
const MAX_NOTE_CHARS = 200_000;
/** Nothing larger than this is read out of a zip: it is not a note. */
const MAX_UNZIPPED_BYTES = 10_000_000;
const MAX_ZIP_FILES = 8_000;
const MAX_WORD_BYTES = 30_000_000;
const MAX_ZIP_DEPTH = 3;

const hidden = (path: string) =>
  path.split('/').some((part) => part.startsWith('.') || part === '__MACOSX');

type Unzip = typeof Fflate;

interface Pool {
  /** Markdown and text, and the names of database .csv files (read as empty). */
  files: NotionFile[];
  words: { name: string; bytes: Uint8Array }[];
  ignored: string[];
}

function addZip(fflate: Unzip, bytes: Uint8Array, prefix: string, pool: Pool, depth: number) {
  const entries = fflate.unzipSync(bytes, {
    filter: (file) =>
      file.originalSize <= MAX_UNZIPPED_BYTES &&
      !file.name.endsWith('/') &&
      /\.(md|markdown|txt|csv|docx|zip)$/i.test(file.name),
  });
  const names = Object.keys(entries);
  if (names.length + pool.files.length > MAX_ZIP_FILES) {
    throw new Error('That zip holds too many files. Import it in parts.');
  }
  for (const name of names) {
    const path = prefix + name;
    if (hidden(path)) continue;
    const data = entries[name]!;
    if (/\.zip$/i.test(name)) {
      // A big Notion export is a zip of zips, split into parts.
      if (depth < MAX_ZIP_DEPTH) addZip(fflate, data, '', pool, depth + 1);
    } else if (/\.docx$/i.test(name)) {
      pool.words.push({ name: name.split('/').pop()!, bytes: data });
    } else if (/\.csv$/i.test(name)) {
      pool.files.push({ path, content: '' });
    } else {
      pool.files.push({ path, content: fflate.strFromU8(data).slice(0, MAX_NOTE_CHARS) });
    }
  }
}

/** The text of a .docx's three useful parts. */
function wordParts(fflate: Unzip, bytes: Uint8Array): DocxParts {
  const parts = fflate.unzipSync(bytes, {
    filter: (file) =>
      ['word/document.xml', 'word/_rels/document.xml.rels', 'word/numbering.xml'].includes(
        file.name,
      ) && file.originalSize <= 50_000_000,
  });
  const document = parts['word/document.xml'];
  if (!document) throw new Error('not a Word document');
  const text = (name: string) => (parts[name] ? fflate.strFromU8(parts[name]!) : undefined);
  return {
    document: fflate.strFromU8(document),
    rels: text('word/_rels/document.xml.rels'),
    numbering: text('word/numbering.xml'),
  };
}

/** Takes off the one folder that holds everything, as a zipped vault has. */
function withoutWrapper(files: NotionFile[]): NotionFile[] {
  const firsts = new Set(files.map((file) => file.path.split('/')[0]));
  if (firsts.size !== 1 || files.some((file) => !file.path.includes('/'))) return files;
  return files.map((file) => ({ ...file, path: file.path.split('/').slice(1).join('/') }));
}

export async function readImportFiles(files: File[], split: DocxSplit): Promise<ImportRead> {
  const pool: Pool = { files: [], words: [], ignored: [] };
  let fflate: Unzip | null = null;
  const loadZip = async () => (fflate ??= await import('fflate'));

  for (const file of files) {
    const relative = file.webkitRelativePath || file.name;
    // The name of a picked folder is not part of the notes' paths.
    const parts = file.webkitRelativePath ? relative.split('/').slice(1) : [relative];
    const path = parts.join('/');
    if (!path || hidden(relative)) continue;
    try {
      if (NOTE.test(file.name)) {
        pool.files.push({ path, content: (await file.text()).slice(0, MAX_NOTE_CHARS) });
      } else if (/\.docx$/i.test(file.name)) {
        if (file.size > MAX_WORD_BYTES) throw new Error('over 30 MB');
        pool.words.push({ name: file.name, bytes: new Uint8Array(await file.arrayBuffer()) });
      } else if (/\.zip$/i.test(file.name)) {
        addZip(await loadZip(), new Uint8Array(await file.arrayBuffer()), '', pool, 0);
      } else if (/\.csv$/i.test(file.name)) {
        pool.files.push({ path, content: '' });
      }
    } catch (error) {
      pool.ignored.push(
        `${file.name} (${error instanceof Error ? error.message : 'could not be read'})`,
      );
    }
  }

  const notes: ImportNote[] = [];
  const from = { markdown: 0, notion: 0, word: 0 };

  const pages = pool.files.filter((file) => /\.(md|markdown|txt)$/i.test(file.path));
  if (pages.length) {
    if (looksLikeNotion(pages.map((page) => page.path))) {
      const converted = notionToNotes(pool.files);
      notes.push(...converted);
      from.notion = converted.length;
    } else {
      const plain = withoutWrapper(pages);
      notes.push(...plain);
      from.markdown = plain.length;
    }
  }

  if (pool.words.length) {
    const fflateModule = await loadZip();
    for (const word of pool.words) {
      try {
        const converted = docxToNotes(word.name, wordParts(fflateModule, word.bytes), split);
        notes.push(...converted);
        from.word += converted.length;
        if (!converted.length) pool.ignored.push(`${word.name} (it has no text)`);
      } catch {
        pool.ignored.push(`${word.name} (not a readable Word document)`);
      }
    }
  }
  return { notes, from, ignored: pool.ignored };
}
