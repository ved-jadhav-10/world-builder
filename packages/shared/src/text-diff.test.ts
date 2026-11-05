import { describe, expect, it } from 'vitest';
import { diffBlocks, diffWords, hasChanges, type DiffBlock, type DiffPart } from './text-diff';

/** Rebuilds one side of a diff, to check nothing is lost or invented. */
const side = (parts: DiffPart[], keep: 'same' | 'add' | 'del') =>
  parts
    .filter((p) => p.op === 'same' || p.op === keep)
    .map((p) => p.text)
    .join('');

const blockSide = (blocks: DiffBlock[], keep: 'add' | 'del') =>
  blocks
    .filter((b) => b.op === 'same' || b.op === 'change' || b.op === keep)
    .map((b) => side(b.parts, keep));

describe('diffWords', () => {
  it('is one unchanged part for equal text, and nothing for empty text', () => {
    expect(diffWords('the cat sat', 'the cat sat')).toEqual([{ op: 'same', text: 'the cat sat' }]);
    expect(diffWords('', '')).toEqual([]);
  });

  it('marks only the words that changed', () => {
    const parts = diffWords('The old king rode north', 'The young king rode south');
    expect(parts).toEqual([
      { op: 'same', text: 'The ' },
      { op: 'del', text: 'old' },
      { op: 'add', text: 'young' },
      { op: 'same', text: ' king rode ' },
      { op: 'del', text: 'north' },
      { op: 'add', text: 'south' },
    ]);
  });

  it('handles pure additions and pure removals', () => {
    expect(diffWords('', 'new words')).toEqual([{ op: 'add', text: 'new words' }]);
    expect(diffWords('old words', '')).toEqual([{ op: 'del', text: 'old words' }]);
    expect(diffWords('a b', 'a b c')).toEqual([
      { op: 'same', text: 'a b' },
      { op: 'add', text: ' c' },
    ]);
  });

  it('can always be played back to either side', () => {
    const a = 'She said nothing, and the rain fell on the long grey road to Vesh.';
    const b = 'She said very little, and rain fell upon the long road to old Vesh!';
    const parts = diffWords(a, b);
    expect(side(parts, 'del')).toBe(a);
    expect(side(parts, 'add')).toBe(b);
  });

  it('falls back to replacing very long paragraphs rather than freezing', () => {
    const a = Array.from({ length: 2000 }, (_, i) => `a${i}`).join(' ');
    const b = Array.from({ length: 2000 }, (_, i) => `b${i}`).join(' ');
    const parts = diffWords(a, b);
    expect(parts).toEqual([
      { op: 'del', text: a },
      { op: 'add', text: b },
    ]);
  });
});

describe('diffBlocks', () => {
  it('reports identical documents as unchanged', () => {
    const blocks = diffBlocks(['one', 'two'], ['one', 'two']);
    expect(blocks.map((b) => b.op)).toEqual(['same', 'same']);
    expect(hasChanges(blocks)).toBe(false);
    expect(hasChanges(diffBlocks([], []))).toBe(false);
  });

  it('finds an added, a removed and a moved-over paragraph', () => {
    const before = ['Opening.', 'The middle.', 'The end.'];
    const after = ['Opening.', 'A new scene.', 'The middle.', 'The end.'];
    expect(diffBlocks(before, after).map((b) => b.op)).toEqual(['same', 'add', 'same', 'same']);
    expect(diffBlocks(after, before).map((b) => b.op)).toEqual(['same', 'del', 'same', 'same']);
  });

  it('shows an edited paragraph as a change with word-level parts', () => {
    const blocks = diffBlocks(
      ['First.', 'The king rode north at dawn.', 'Last.'],
      ['First.', 'The king rode south at dawn.', 'Last.'],
    );
    expect(blocks.map((b) => b.op)).toEqual(['same', 'change', 'same']);
    expect(blocks[1]!.parts.filter((p) => p.op !== 'same')).toEqual([
      { op: 'del', text: 'north' },
      { op: 'add', text: 'south' },
    ]);
  });

  it('treats a rewritten paragraph as a removal and an addition', () => {
    const blocks = diffBlocks(
      ['Alpha beta gamma delta.'],
      ['Completely different words here now.'],
    );
    expect(blocks.map((b) => b.op)).toEqual(['del', 'add']);
  });

  it('can always be played back to both versions', () => {
    const before = ['A', 'B one two three', 'C', 'D', 'E'];
    const after = ['A', 'B one 2 three', 'D', 'F', 'E', 'G'];
    const blocks = diffBlocks(before, after);
    expect(blockSide(blocks, 'del')).toEqual(before);
    expect(blockSide(blocks, 'add')).toEqual(after);
  });

  it('copes with a document emptied or filled', () => {
    expect(diffBlocks(['a', 'b'], []).map((b) => b.op)).toEqual(['del', 'del']);
    expect(diffBlocks([], ['a', 'b']).map((b) => b.op)).toEqual(['add', 'add']);
  });

  it('handles a long document quickly', () => {
    const before = Array.from({ length: 800 }, (_, i) => `Paragraph ${i} of the story.`);
    const after = before.slice();
    after[100] = 'Paragraph 100 was rewritten entirely.';
    after.splice(400, 1);
    after.push('An epilogue.');
    const started = Date.now();
    const blocks = diffBlocks(before, after);
    expect(Date.now() - started).toBeLessThan(1500);
    expect(blockSide(blocks, 'add')).toEqual(after);
  });
});
