import { strToU8, zipSync } from 'fflate';
import { describe, expect, it } from 'vitest';
import { readImportFiles } from './import-files';

const file = (name: string, data: Uint8Array | string, path?: string) => {
  const made = new File([typeof data === 'string' ? data : (data as BlobPart)], name);
  if (path) Object.defineProperty(made, 'webkitRelativePath', { value: path });
  return made;
};

const xml = (body: string) => `<w:document><w:body>${body}</w:body></w:document>`;
const p = (text: string, style = '') =>
  `<w:p><w:pPr>${style ? `<w:pStyle w:val="${style}"/>` : ''}</w:pPr><w:r><w:t>${text}</w:t></w:r></w:p>`;
const docx = (body: string) =>
  zipSync({
    'word/document.xml': strToU8(xml(body)),
    '[Content_Types].xml': strToU8('<Types/>'),
  });

const ID = '3f2a9c1d7b8e4a6f9d0c1b2a3e4f5a6b';
const FOLDER = '77778888999900001111222233334444';

describe('reading what was picked for import', () => {
  it('reads Markdown and text files as they are, and ignores hidden folders', async () => {
    const read = await readImportFiles(
      [
        file('Mira.md', '# Mira', 'Vault/Characters/Mira.md'),
        file('app.json', '{}', 'Vault/.obsidian/app.json'),
        file('Plan.md', 'x', 'Vault/.obsidian/Plan.md'),
        file('Notes.txt', 'plain', 'Vault/Notes.txt'),
        file('photo.png', 'x', 'Vault/photo.png'),
      ],
      'auto',
    );
    expect(read.notes.map((note) => note.path)).toEqual(['Characters/Mira.md', 'Notes.txt']);
    expect(read.from).toEqual({ markdown: 2, notion: 0, word: 0 });
  });

  it('opens a Word document and cuts it at its headings', async () => {
    const read = await readImportFiles(
      [
        file(
          'Characters.docx',
          docx(
            p('Mira Vey', 'Heading1') +
              p('Owner of the Eel.') +
              p('Odo Karr', 'Heading1') +
              p('Harbourmaster.'),
          ),
        ),
      ],
      'auto',
    );
    expect(read.notes.map((note) => note.path)).toEqual([
      'Characters/Mira Vey.md',
      'Characters/Odo Karr.md',
    ]);
    expect(read.from.word).toBe(2);
    const whole = await readImportFiles(
      [file('Characters.docx', docx(p('A', 'Heading1') + p('B', 'Heading1')))],
      'none',
    );
    expect(whole.notes).toHaveLength(1);
  });

  it('reports a file that is not a Word document instead of failing the rest', async () => {
    const read = await readImportFiles(
      [file('Broken.docx', 'not a zip'), file('Ok.md', '# Ok')],
      'auto',
    );
    expect(read.notes.map((note) => note.path)).toEqual(['Ok.md']);
    expect(read.ignored).toHaveLength(1);
    expect(read.ignored[0]).toContain('Broken.docx');
  });

  it('reads a zipped Notion export, parts of it in zips of their own, as one', async () => {
    const part1 = zipSync({
      [`Aerth/Characters ${FOLDER}.csv`]: strToU8('Name'),
      [`Aerth/Characters ${FOLDER}/Mira Vey ${ID}.md`]: strToU8(
        `# Mira Vey\n\nType: Character\n\nKnows [Odo](Characters%20${FOLDER}/Odo%20Karr%20${ID.replace('3f', '4f')}.md).`,
      ),
    });
    const part2 = zipSync({
      [`Aerth/Characters ${FOLDER}/Odo Karr ${ID.replace('3f', '4f')}.md`]: strToU8(
        '# Odo Karr\n\nType: Character',
      ),
    });
    const outer = zipSync({ 'Export-Part-1.zip': part1, 'Export-Part-2.zip': part2 });
    const read = await readImportFiles([file('Export.zip', outer)], 'auto');
    expect(read.from.notion).toBe(2);
    expect(read.notes.map((note) => note.path)).toEqual([
      'Characters/Mira Vey.md',
      'Characters/Odo Karr.md',
    ]);
    // The link across the two parts was followed.
    expect(read.notes[0]!.content).toContain('[[Odo Karr|Odo]]');
  });

  it('reads a zipped vault as plain notes, without the folder that wraps it', async () => {
    const zip = zipSync({
      'MyVault/Characters/Mira.md': strToU8('# Mira'),
      'MyVault/Places/Vesh.md': strToU8('# Vesh'),
      'MyVault/.obsidian/app.json': strToU8('{}'),
      'MyVault/__MACOSX/junk.md': strToU8('x'),
    });
    const read = await readImportFiles([file('MyVault.zip', zip)], 'auto');
    expect(read.notes.map((note) => note.path)).toEqual(['Characters/Mira.md', 'Places/Vesh.md']);
    expect(read.from.markdown).toBe(2);
  });
});
