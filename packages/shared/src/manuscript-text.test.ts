import { describe, expect, it } from 'vitest';
import { blockWords, richTextToBlocks } from './manuscript-text';

const text = (t: string, marks: { type: string; attrs?: Record<string, unknown> }[] = []) => ({
  type: 'text',
  text: t,
  ...(marks.length ? { marks } : {}),
});
const para = (...content: unknown[]) => ({ type: 'paragraph', content });
const doc = (...content: unknown[]) => ({ type: 'doc', content });

describe('richTextToBlocks', () => {
  it('gives nothing for an empty or missing document', () => {
    expect(richTextToBlocks(null)).toEqual([]);
    expect(richTextToBlocks(doc())).toEqual([]);
    expect(richTextToBlocks({ type: 'doc' })).toEqual([]);
  });

  it('turns paragraphs into blocks of runs and skips blank ones', () => {
    const blocks = richTextToBlocks(doc(para(text('One.')), para(), para(text('Two.'))));
    expect(blocks).toEqual([
      { kind: 'paragraph', runs: [{ text: 'One.' }] },
      { kind: 'paragraph', runs: [{ text: 'Two.' }] },
    ]);
  });

  it('carries bold, italic, underline, strike and code', () => {
    const blocks = richTextToBlocks(
      doc(
        para(
          text('plain '),
          text('b', [{ type: 'bold' }]),
          text('i', [{ type: 'italic' }]),
          text('both', [{ type: 'bold' }, { type: 'italic' }]),
          text('u', [{ type: 'underline' }]),
          text('s', [{ type: 'strike' }]),
          text('c', [{ type: 'code' }]),
        ),
      ),
    );
    expect(blocks[0]).toEqual({
      kind: 'paragraph',
      runs: [
        { text: 'plain ' },
        { text: 'b', bold: true },
        { text: 'i', italic: true },
        { text: 'both', bold: true, italic: true },
        { text: 'u', underline: true },
        { text: 's', strike: true },
        { text: 'c', code: true },
      ],
    });
  });

  it('keeps web and mail links and drops anything else', () => {
    const link = (href: string) => text('x', [{ type: 'link', attrs: { href } }]);
    const blocks = richTextToBlocks(
      doc(
        para(
          link('https://example.com/a'),
          link('mailto:me@example.com'),
          link('javascript:alert(1)'),
          link('file:///etc/passwd'),
        ),
      ),
    );
    const runs = (blocks[0] as { runs: { link?: string }[] }).runs;
    expect(runs.map((r) => r.link)).toEqual([
      'https://example.com/a',
      'mailto:me@example.com',
      undefined,
      undefined,
    ]);
  });

  it('keeps line breaks inside a paragraph', () => {
    const blocks = richTextToBlocks(doc(para(text('a'), { type: 'hardBreak' }, text('b'))));
    expect(blocks[0]).toEqual({
      kind: 'paragraph',
      runs: [{ text: 'a' }, { text: '', lineBreak: true }, { text: 'b' }],
    });
  });

  it('reads headings, clamping the level', () => {
    const heading = (level: number, t: string) => ({
      type: 'heading',
      attrs: { level },
      content: [text(t)],
    });
    const blocks = richTextToBlocks(
      doc(heading(2, 'A'), heading(3, 'B'), heading(6, 'C'), heading(0, 'D')),
    );
    expect(blocks.map((b) => (b.kind === 'heading' ? b.level : null))).toEqual([2, 3, 3, 1]);
  });

  it('flattens block quotes, code blocks and rules', () => {
    const blocks = richTextToBlocks(
      doc(
        { type: 'blockquote', content: [para(text('Said once.')), para(text('Said twice.'))] },
        { type: 'codeBlock', content: [text('let x = 1;')] },
        { type: 'horizontalRule' },
        para(text('After.')),
      ),
    );
    expect(blocks.map((b) => b.kind)).toEqual(['quote', 'quote', 'code', 'rule', 'paragraph']);
    expect(blocks[2]).toEqual({ kind: 'code', text: 'let x = 1;' });
  });

  it('turns lists into items with their depth and kind', () => {
    const item = (...content: unknown[]) => ({ type: 'listItem', content });
    const blocks = richTextToBlocks(
      doc({
        type: 'bulletList',
        content: [
          item(para(text('one')), {
            type: 'orderedList',
            content: [item(para(text('one-a'))), item(para(text('one-b')))],
          }),
          item(para(text('two'))),
        ],
      }),
    );
    expect(
      blocks.map((b) => (b.kind === 'list' ? [b.ordered, b.depth, b.runs[0]!.text] : b.kind)),
    ).toEqual([
      [false, 0, 'one'],
      [true, 1, 'one-a'],
      [true, 1, 'one-b'],
      [false, 0, 'two'],
    ]);
  });

  it('looks inside wrappers it does not know rather than losing the text', () => {
    const blocks = richTextToBlocks(doc({ type: 'callout', content: [para(text('Inside.'))] }));
    expect(blocks).toEqual([{ kind: 'paragraph', runs: [{ text: 'Inside.' }] }]);
  });
});

describe('blockWords', () => {
  it('counts the words of every kind of block', () => {
    const blocks = richTextToBlocks(
      doc(
        para(text('Three small words')),
        { type: 'blockquote', content: [para(text('and two'))] },
        { type: 'codeBlock', content: [text('x y')] },
        { type: 'horizontalRule' },
      ),
    );
    expect(blockWords(blocks)).toBe(7);
  });
});
