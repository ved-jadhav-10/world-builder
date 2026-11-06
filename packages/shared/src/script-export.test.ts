import { describe, expect, it } from 'vitest';
import { quotedLine, toComicScript, toFountain, type ScriptInput } from './script-export';
import type { ManuscriptBlock } from './manuscript-text';

const p = (text: string): ManuscriptBlock => ({ kind: 'paragraph', runs: [{ text }] });

const input: ScriptInput = {
  title: 'The Salt Road',
  author: 'Mira Vey',
  books: [
    {
      title: 'Book One',
      chapters: [
        {
          title: 'The Docks',
          scenes: [
            {
              title: 'Arrival',
              summary: 'Mira lands.',
              location: 'Vael Harbour',
              date: 'dawn',
              pov: 'Mira',
              blocks: [p('Mira reached the docks.'), p('“You are late.”'), p('She nodded.')],
            },
            {
              title: 'Market',
              summary: '',
              location: null,
              date: '',
              pov: null,
              blocks: [p('Stalls lined the quay.')],
            },
            { title: 'Empty', summary: '', location: 'Nowhere', date: '', pov: null, blocks: [] },
          ],
        },
      ],
    },
  ],
};

describe('quotedLine', () => {
  it('reads a paragraph that is one line of speech', () => {
    expect(quotedLine('“You are late.”')).toBe('You are late.');
    expect(quotedLine('"Plain quotes."')).toBe('Plain quotes.');
  });
  it('leaves narration, tagged speech and several quotations alone', () => {
    expect(quotedLine('She said nothing.')).toBeNull();
    expect(quotedLine('“Get down,” she hissed.')).toBeNull();
    expect(quotedLine('“One.” Then “two.”')).toBeNull();
    expect(quotedLine('""')).toBeNull();
  });
});

describe('toFountain', () => {
  const text = toFountain(input);

  it('starts with a title page and puts the chapter as a section', () => {
    expect(text.startsWith('Title: The Salt Road\nAuthor: Mira Vey\n')).toBe(true);
    expect(text).toContain('## The Docks');
  });

  it('heads a scene with its place and time, or its title when it has no place', () => {
    expect(text).toContain('INT./EXT. VAEL HARBOUR - DAWN');
    expect(text).toContain('.MARKET');
  });

  it('keeps the summary and viewpoint as synopsis and note, narration as action', () => {
    expect(text).toContain('= Mira lands.');
    expect(text).toContain("[[Told from Mira's point of view]]");
    expect(text).toContain('Mira reached the docks.');
  });

  it('turns a quoted line into dialogue with a speaker to fill in, and skips empty scenes', () => {
    expect(text).toContain('@SPEAKER\nYou are late.');
    expect(text).not.toContain('NOWHERE');
  });
});

describe('toComicScript', () => {
  const text = toComicScript(input);

  it('makes a page for each written scene, in words', () => {
    expect(text).toContain('PAGE ONE');
    expect(text).toContain('PAGE TWO');
    expect(text).not.toContain('PAGE THREE');
    expect(text).toContain('(Arrival: Vael Harbour, dawn)');
  });

  it('makes a panel for each stretch of action, with speech as balloon lines', () => {
    expect(text).toContain('Panel 1\nMira reached the docks.');
    expect(text).toContain('SPEAKER: You are late.');
    expect(text).toContain('Panel 2\nShe nodded.');
  });
});
