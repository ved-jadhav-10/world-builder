import { describe, expect, it } from 'vitest';
import { richTextToMarkdown } from './markdown';
import type { RichTextDoc } from './schemas/entity';

const doc = (...content: unknown[]): RichTextDoc => ({ type: 'doc', content });
const p = (...content: unknown[]) => ({ type: 'paragraph', content });
const text = (value: string, ...marks: string[]) => ({
  type: 'text',
  text: value,
  ...(marks.length ? { marks: marks.map((type) => ({ type })) } : {}),
});
const md = (...content: unknown[]) => richTextToMarkdown(doc(...content));

describe('richTextToMarkdown', () => {
  it('handles empty and missing documents', () => {
    expect(richTextToMarkdown(null)).toBe('');
    expect(richTextToMarkdown(undefined)).toBe('');
    expect(md()).toBe('');
    expect(md(p())).toBe('');
  });

  it('separates paragraphs with a blank line', () => {
    expect(md(p(text('One.')), p(text('Two.')))).toBe('One.\n\nTwo.');
  });

  it('writes headings at their level', () => {
    expect(md({ type: 'heading', attrs: { level: 2 }, content: [text('Title')] })).toBe('## Title');
    expect(md({ type: 'heading', attrs: { level: 3 }, content: [text('Sub')] })).toBe('### Sub');
  });

  it('writes bold, italic, strike and code', () => {
    expect(md(p(text('bold', 'bold'), text(' and '), text('italic', 'italic')))).toBe(
      '**bold** and *italic*',
    );
    expect(md(p(text('both', 'bold', 'italic')))).toBe('***both***');
    expect(md(p(text('gone', 'strike')))).toBe('~~gone~~');
    expect(md(p(text('x = 1', 'code')))).toBe('`x = 1`');
    expect(md(p(text('a `tick`', 'code')))).toBe('``a `tick```');
  });

  it('keeps markers against the words, not the spaces around them', () => {
    // `** padded **` would not be read as bold.
    expect(md(p(text('a'), text(' padded ', 'bold'), text('b')))).toBe('a **padded** b');
  });

  it('writes links', () => {
    const link = {
      type: 'text',
      text: 'the docs',
      marks: [{ type: 'link', attrs: { href: 'https://example.com/a_(b)' } }],
    };
    expect(md(p(text('See '), link, text('.')))).toBe(
      'See [the docs](https://example.com/a_(b%29).',
    );
  });

  it('writes line breaks inside a paragraph', () => {
    expect(md(p(text('one'), { type: 'hardBreak' }, text('two')))).toBe('one  \ntwo');
  });

  it('writes bullet and numbered lists, including nested ones', () => {
    const item = (...content: unknown[]) => ({ type: 'listItem', content });
    expect(md({ type: 'bulletList', content: [item(p(text('a'))), item(p(text('b')))] })).toBe(
      '- a\n- b',
    );
    expect(md({ type: 'orderedList', content: [item(p(text('a'))), item(p(text('b')))] })).toBe(
      '1. a\n2. b',
    );
    expect(md({ type: 'orderedList', attrs: { start: 3 }, content: [item(p(text('c')))] })).toBe(
      '3. c',
    );
    expect(
      md({
        type: 'bulletList',
        content: [
          item(p(text('top')), { type: 'bulletList', content: [item(p(text('inner')))] }),
          item(p(text('next'))),
        ],
      }),
    ).toBe('- top\n  - inner\n- next');
  });

  it('writes block quotes and code blocks', () => {
    expect(md({ type: 'blockquote', content: [p(text('Wise words.')), p(text('More.'))] })).toBe(
      '> Wise words.\n>\n> More.',
    );
    expect(
      md({ type: 'codeBlock', attrs: { language: 'js' }, content: [text('let a = 1;')] }),
    ).toBe('```js\nlet a = 1;\n```');
    // A fence is longer than any run of backticks inside it.
    expect(md({ type: 'codeBlock', content: [text('use ``` here')] })).toBe(
      '````\nuse ``` here\n````',
    );
    expect(md({ type: 'horizontalRule' })).toBe('---');
  });

  it('escapes text that would be read as formatting', () => {
    expect(md(p(text('2 * 3 = 6 and snake_case and [x] and <b>')))).toBe(
      '2 \\* 3 = 6 and snake\\_case and \\[x\\] and \\<b\\>',
    );
    // Lines that would turn into headings, lists or quotes are neutralised.
    expect(md(p(text('# not a heading')))).toBe('\\# not a heading');
    expect(md(p(text('- not a list')))).toBe('\\- not a list');
    expect(md(p(text('1. not a list')))).toBe('1\\. not a list');
    expect(md(p(text('> not a quote')))).toBe('\\> not a quote');
    expect(md(p(text('a back\\slash')))).toBe('a back\\\\slash');
  });

  it('keeps the text of nodes it does not know', () => {
    expect(md({ type: 'callout', content: [p(text('Careful.'))] })).toBe('Careful.');
    expect(md(p({ type: 'mystery', content: [text('inline text')] }))).toBe('inline text');
    expect(md({ type: 'mystery' })).toBe('');
  });

  it('handles a realistic mix', () => {
    const item = (...content: unknown[]) => ({ type: 'listItem', content });
    const result = md(
      { type: 'heading', attrs: { level: 2 }, content: [text('The Eel')] },
      p(text('A '), text('smugglers', 'bold'), text(' tavern.')),
      { type: 'bulletList', content: [item(p(text('Low ceilings'))), item(p(text('A trapdoor')))] },
      { type: 'blockquote', content: [p(text('Nobody asks.'))] },
    );
    expect(result).toBe(
      '## The Eel\n\nA **smugglers** tavern.\n\n- Low ceilings\n- A trapdoor\n\n> Nobody asks.',
    );
  });
});
