import { describe, expect, it } from 'vitest';
import { buildMentionMatcher, countMentions, countWords, richTextBlocks } from './mentions';

const sources = [
  { id: 'mira', name: 'Mira Vey', aliases: ['Mira', 'The Barkeep'] },
  { id: 'eel', name: 'The Gilded Eel', aliases: [] },
  { id: 'a', name: 'Ash', aliases: ['Rowan'] },
  { id: 'b', name: 'Rowan', aliases: [] },
];

describe('buildMentionMatcher', () => {
  const matcher = buildMentionMatcher(sources);

  it('finds names and aliases, case-insensitively, longest first', () => {
    const text = 'Mira Vey poured. Later, mira laughed at the barkeep, The Barkeep.';
    expect(matcher.find(text).map((m) => [m.entityId, text.slice(m.start, m.end)])).toEqual([
      ['mira', 'Mira Vey'],
      ['mira', 'mira'],
      ['mira', 'the barkeep'],
      ['mira', 'The Barkeep'],
    ]);
  });

  it('only matches whole words', () => {
    expect(matcher.find('Miranda and the Gilded Eels')).toEqual([]);
  });

  it('handles flexible whitespace and punctuation edges', () => {
    const text = 'At "The  Gilded Eel", Mira—';
    expect(matcher.find(text).map((m) => m.entityId)).toEqual(['eel', 'mira']);
  });

  it('ignores ambiguous terms shared by two entities', () => {
    expect(matcher.find('Rowan arrived.')).toEqual([]);
    expect(matcher.find('Ash arrived.').map((m) => m.entityId)).toEqual(['a']);
  });

  it('copes with regex characters and empty input', () => {
    const odd = buildMentionMatcher([{ id: 'x', name: 'C++ (Old)', aliases: [] }]);
    // Whole-word boundaries sit after the final ")", so the term is found.
    expect(odd.find('C++ (Old) rules').map((m) => m.entityId)).toEqual(['x']);
    expect(buildMentionMatcher([]).find('anything')).toEqual([]);
  });
});

describe('helpers', () => {
  it('counts mentions per entity', () => {
    const matcher = buildMentionMatcher(sources);
    const counts = countMentions(matcher, ['Mira, Mira!', 'The Gilded Eel']);
    expect(counts.get('mira')).toBe(2);
    expect(counts.get('eel')).toBe(1);
  });

  it('counts words', () => {
    expect(countWords("It's a well-known fact, isn't it?")).toBe(6);
    expect(countWords('')).toBe(0);
  });

  it('splits a document into text blocks', () => {
    const doc = {
      type: 'doc',
      content: [
        { type: 'paragraph', content: [{ type: 'text', text: 'One' }] },
        { type: 'paragraph' },
        {
          type: 'bulletList',
          content: [
            {
              type: 'listItem',
              content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Two' }] }],
            },
          ],
        },
      ],
    };
    expect(richTextBlocks(doc)).toEqual(['One', 'Two']);
  });
});
