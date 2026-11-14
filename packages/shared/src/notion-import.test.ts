import { describe, expect, it } from 'vitest';
import { parseMarkdownNote } from './markdown-import';
import { looksLikeNotion, notionToNotes, type NotionFile } from './notion-import';

const A = '3f2a9c1d7b8e4a6f9d0c1b2a3e4f5a6b';
const B = '9a8b7c6d5e4f3a2b1c0d9e8f7a6b5c4d';
const C = '11112222333344445555666677778888';
const D = 'aaaabbbbccccddddeeeeffff00001111';

const files: NotionFile[] = [
  // A database: a .csv beside a folder of the same name, one page per row.
  { path: `Aerth ${D}/Characters ${C}.csv`, content: '' },
  { path: `Aerth ${D}/Characters ${C}_all.csv`, content: '' },
  {
    path: `Aerth ${D}/Characters ${C}/Mira Vey ${A}.md`,
    content: [
      '# Mira Vey',
      '',
      'Type: Character',
      'Tags: Main cast, Pilot',
      'Aliases: Mira, The Barkeep',
      'Age: 41',
      'Created: November 3, 2026 2:10 PM',
      `Knows: [Odo Karr](Characters%20${C}/Odo%20Karr%20${B}.md), [Her ledger](https://example.com/ledger)`,
      '',
      'She runs **the Eel**. See [the Harbourmaster](Characters%20' +
        C +
        '/Odo%20Karr%20' +
        B +
        '.md).',
      '',
      '![chart](chart.png)',
      '<aside>A callout</aside>',
      'A line<br>break and a [dead link](Gone%20ffffffffffffffffffffffffffffffff.md).',
    ].join('\n'),
  },
  {
    path: `Aerth ${D}/Characters ${C}/Odo Karr ${B}.md`,
    content: '# Odo Karr\n\nSummary: Harbourmaster of Vesh.\n\nPatient, exact, tired.\n',
  },
  // An ordinary page, not a database row: a first line like this is not a property.
  {
    path: `Aerth ${D}/Notes on tides ${A.replace('3', '4')}.md`,
    content: '# Notes on tides\n\nNote: this page is about the sea.\n\nThe tide turns at dusk.',
  },
];

describe('reading a Notion export', () => {
  it('recognises the IDs in Notion’s file names', () => {
    expect(looksLikeNotion(files.map((file) => file.path))).toBe(true);
    expect(looksLikeNotion(['Characters/Mira Vey.md', 'Places/Vesh.md'])).toBe(false);
    expect(looksLikeNotion([])).toBe(false);
    expect(looksLikeNotion(['a.csv'])).toBe(false);
  });

  it('names notes without IDs and puts each in its database’s folder', () => {
    const notes = notionToNotes(files);
    expect(notes.map((note) => note.path)).toEqual([
      'Characters/Mira Vey.md',
      'Characters/Odo Karr.md',
      'Aerth/Notes on tides.md',
    ]);
  });

  it('turns properties into front-matter and a list, and leaves out Notion’s own', () => {
    const mira = parseMarkdownNote(
      ...(Object.values(notionToNotes(files)[0]!) as [string, string]),
    );
    expect(mira).toMatchObject({
      name: 'Mira Vey',
      typeHint: 'Character',
      aliases: ['Mira', 'The Barkeep'],
      tags: ['Main cast', 'Pilot'],
    });
    // A plain value may belong in a field of the type, so it is passed on as a property...
    expect(mira.properties).toEqual([['Age', '41']]);
    // ...one that holds a link is written into the article, and Notion's own bookkeeping goes.
    const text = JSON.stringify(mira.body);
    expect(text).toContain('Knows:');
    expect(text).not.toContain('Created');
    expect(text).not.toContain('November');
    expect(JSON.stringify(mira.properties)).not.toContain('Created');
  });

  it('turns links between pages into wikilinks, and drops what cannot be followed', () => {
    const [miraNote] = notionToNotes(files);
    const mira = parseMarkdownNote(miraNote!.path, miraNote!.content);
    expect(mira.links).toEqual(['Odo Karr']);
    const text = JSON.stringify(mira.body);
    expect(text).toContain('the Harbourmaster');
    expect(text).toContain('https://example.com/ledger');
    expect(text).toContain('dead link');
    expect(text).not.toContain('chart.png');
    expect(text).not.toContain('<aside>');
    expect(text).not.toContain('<br>');
    expect(text).toContain('A callout');
  });

  it('reads a summary property, and leaves a plain page’s first lines alone', () => {
    const notes = notionToNotes(files);
    expect(parseMarkdownNote(notes[1]!.path, notes[1]!.content).summary).toBe(
      'Harbourmaster of Vesh.',
    );
    const plain = parseMarkdownNote(notes[2]!.path, notes[2]!.content);
    expect(plain.typeHint).toBe('Aerth');
    expect(JSON.stringify(plain.body)).toContain('Note: this page is about the sea.');
  });

  it('uses the title inside the page when Notion has cut the file name short', () => {
    const [note] = notionToNotes([
      {
        path: `Very long ${A}.md`,
        content: '# A very long title that Notion cut off in the name of the file',
      },
    ]);
    expect(note!.path).toBe('A very long title that Notion cut off in the name of the file.md');
  });
});
