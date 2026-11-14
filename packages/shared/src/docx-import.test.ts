import { describe, expect, it } from 'vitest';
import { docxToMarkdown, docxToNotes, type DocxParts } from './docx-import';
import { parseMarkdownNote } from './markdown-import';

const run = (text: string, properties = '') =>
  `<w:r>${properties ? `<w:rPr>${properties}</w:rPr>` : ''}<w:t xml:space="preserve">${text}</w:t></w:r>`;
const para = (inner: string, style = '', extra = '') =>
  `<w:p><w:pPr>${style ? `<w:pStyle w:val="${style}"/>` : ''}${extra}</w:pPr>${inner}</w:p>`;
const list = (inner: string, numId: number, level = 0) =>
  para(
    inner,
    'ListParagraph',
    `<w:numPr><w:ilvl w:val="${level}"/><w:numId w:val="${numId}"/></w:numPr>`,
  );
const doc = (...blocks: string[]): DocxParts => ({
  document: `<w:document><w:body>${blocks.join('')}</w:body></w:document>`,
  numbering: `<w:numbering>
    <w:abstractNum w:abstractNumId="0"><w:lvl w:ilvl="0"><w:numFmt w:val="bullet"/></w:lvl></w:abstractNum>
    <w:abstractNum w:abstractNumId="1"><w:lvl w:ilvl="0"><w:numFmt w:val="decimal"/></w:lvl></w:abstractNum>
    <w:num w:numId="1"><w:abstractNumId w:val="0"/></w:num>
    <w:num w:numId="2"><w:abstractNumId w:val="1"/></w:num>
  </w:numbering>`,
  rels: `<Relationships>
    <Relationship Id="rId9" Type="x/hyperlink" Target="https://example.com/a?b=1&amp;c=2" TargetMode="External"/>
    <Relationship Id="rId3" Type="x/styles" Target="styles.xml"/>
  </Relationships>`,
});

describe('reading a Word document', () => {
  it('turns headings, paragraphs, emphasis, links and lists into Markdown', () => {
    const markdown = docxToMarkdown(
      doc(
        para(run('Mira Vey'), 'Heading1'),
        para(
          run('She runs the ') +
            run('Gilded Eel', '<w:b/>') +
            run(' and ') +
            run('owes', '<w:i/>') +
            run(' everyone.'),
        ),
        para(run('Manner'), 'Heading2'),
        list(run('Dry'), 1),
        list(run('Watchful'), 1),
        list(run('First'), 2),
        list(run('Nested'), 1, 1),
        para(
          run('See ') +
            `<w:hyperlink r:id="rId9">${run('the chart')}</w:hyperlink>` +
            run(' and ') +
            `<w:hyperlink r:id="rId3">${run('styles')}</w:hyperlink>` +
            run(' & more'),
        ),
        para(run('Title only'), 'Title'),
        '<w:p/>',
        para(''),
      ),
    );
    expect(markdown).toBe(
      [
        '# Mira Vey',
        '',
        'She runs the **Gilded Eel** and *owes* everyone.',
        '',
        '## Manner',
        '',
        '- Dry',
        '- Watchful',
        '1. First',
        '  - Nested',
        '',
        'See [the chart](https://example.com/a?b=1&c=2) and styles & more',
        '',
        '# Title only',
      ].join('\n'),
    );
  });

  it('puts the marks round the words, not the spaces, and ignores switched-off ones', () => {
    const markdown = docxToMarkdown(
      doc(
        para(
          run('a ') +
            run(' bold ', '<w:b/>') +
            run('c', '<w:b w:val="0"/><w:i w:val="false"/>') +
            run('d', '<w:b/>') +
            run('e', '<w:b/>'),
        ),
      ),
    );
    expect(markdown).toBe('a **bold** c**de**');
  });

  it('writes a table as one bulleted line per row', () => {
    const cell = (text: string) => `<w:tc>${para(run(text))}</w:tc>`;
    const markdown = docxToMarkdown(
      doc(
        `<w:tbl><w:tr>${cell('Name')}${cell('Age')}</w:tr><w:tr>${cell('Mira')}${cell('41')}</w:tr></w:tbl>`,
      ),
    );
    expect(markdown).toBe('- Name | Age\n- Mira | 41');
  });
});

describe('cutting a document into notes', () => {
  const bible = doc(
    para(run('Mira Vey'), 'Heading1'),
    para(run('Owner of the Eel.')),
    para(run('Odo Karr'), 'Heading1'),
    para(run('Harbourmaster.')),
    para(run('Habits'), 'Heading2'),
    para(run('Counts the ships twice.')),
  );

  it('cuts at Heading 1, keeping deeper headings inside, and names the folder after the file', () => {
    const notes = docxToNotes('Characters.docx', bible);
    expect(notes.map((note) => note.path)).toEqual([
      'Characters/Mira Vey.md',
      'Characters/Odo Karr.md',
    ]);
    // The same reader the Markdown importer uses understands them, folder and all.
    const odo = parseMarkdownNote(notes[1]!.path, notes[1]!.content);
    expect(odo).toMatchObject({ name: 'Odo Karr', typeHint: 'Characters' });
    expect(JSON.stringify(odo.body)).toContain('Counts the ships twice.');
    expect(JSON.stringify(odo.body)).toContain('Habits');
  });

  it('cuts at Heading 2 when Heading 1 is only the title, and drops the title', () => {
    const notes = docxToNotes(
      'World bible.docx',
      doc(
        para(run('The World of Aerth'), 'Heading1'),
        para(run('A note before anything else.')),
        para(run('Vesh'), 'Heading2'),
        para(run('A salt city.')),
        para(run('The Reach'), 'Heading2'),
        para(run('Drowned channels.')),
      ),
    );
    expect(notes.map((note) => note.path)).toEqual([
      'World bible/World bible.md',
      'World bible/Vesh.md',
      'World bible/The Reach.md',
    ]);
    expect(notes[0]!.content).toBe('A note before anything else.');
  });

  it('can keep a document whole, or cut where it is told to', () => {
    expect(docxToNotes('Notes.docx', bible, 'none').map((note) => note.path)).toEqual([
      'Notes/Notes.md',
    ]);
    expect(docxToNotes('Notes.docx', bible, 2).map((note) => note.path)).toEqual([
      'Notes/Notes.md',
      'Notes/Habits.md',
    ]);
    // Asked to cut at a level that is not there, it stays whole.
    expect(docxToNotes('Notes.docx', bible, 3)).toHaveLength(1);
  });

  it('gives nothing for an empty document and keeps slashes out of names', () => {
    expect(docxToNotes('Empty.docx', doc(para('')))).toEqual([]);
    const notes = docxToNotes(
      'X.docx',
      doc(para(run('Fire/Ice'), 'Heading1'), para(run('a')), para(run('Two'), 'Heading1')),
    );
    expect(notes.map((note) => note.path)).toEqual(['X/Fire-Ice.md', 'X/Two.md']);
  });
});
