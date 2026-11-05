import { describe, expect, it } from 'vitest';
import { blocksToXhtml, escapeXml } from './manuscript-html';
import { richTextToBlocks, type ManuscriptBlock } from './manuscript-text';

const p = (text: string): ManuscriptBlock => ({ kind: 'paragraph', runs: [{ text }] });
const li = (text: string, depth = 0, ordered = false): ManuscriptBlock => ({
  kind: 'list',
  ordered,
  depth,
  runs: [{ text }],
});

describe('escapeXml', () => {
  it('escapes every character that could break out of text or an attribute', () => {
    expect(escapeXml(`<a href="x">Tom & 'Jerry'</a>`)).toBe(
      '&lt;a href=&quot;x&quot;&gt;Tom &amp; &#39;Jerry&#39;&lt;/a&gt;',
    );
  });
});

describe('blocksToXhtml', () => {
  it('writes paragraphs, headings, quotes, code and rules', () => {
    const html = blocksToXhtml([
      p('One & two.'),
      { kind: 'heading', level: 1, runs: [{ text: 'Sub' }] },
      { kind: 'quote', runs: [{ text: 'Said.' }] },
      { kind: 'code', text: 'a < b' },
      { kind: 'rule' },
    ]);
    expect(html).toBe(
      [
        '<p>One &amp; two.</p>',
        '<h3>Sub</h3>',
        '<blockquote><p>Said.</p></blockquote>',
        '<pre>a &lt; b</pre>',
        '<hr />',
      ].join('\n'),
    );
  });

  it('nests marks and links, and writes line breaks as self-closing tags', () => {
    const html = blocksToXhtml([
      {
        kind: 'paragraph',
        runs: [
          { text: 'both', bold: true, italic: true },
          { text: '', lineBreak: true },
          { text: 'site', link: 'https://example.com/?a=1&b=2' },
          { text: 'x', code: true, strike: true, underline: true },
        ],
      },
    ]);
    expect(html).toBe(
      '<p><em><strong>both</strong></em><br /><a href="https://example.com/?a=1&amp;b=2">site</a><s><u><code>x</code></u></s></p>',
    );
  });

  it('gathers list items into one list, closed before the next paragraph', () => {
    expect(blocksToXhtml([li('a'), li('b'), p('after')])).toBe(
      '<ul><li>a</li><li>b</li></ul>\n<p>after</p>',
    );
  });

  it('nests deeper lists inside the item before them', () => {
    const html = blocksToXhtml([li('a'), li('a1', 1, true), li('a2', 1, true), li('b')]);
    expect(html).toBe('<ul><li>a<ol><li>a1</li><li>a2</li></ol></li><li>b</li></ul>');
  });

  it('starts a new list when the kind changes at the same level', () => {
    expect(blocksToXhtml([li('a'), li('b', 0, true)])).toBe(
      '<ul><li>a</li></ul>\n<ol><li>b</li></ol>',
    );
  });

  it('is balanced whatever the nesting: every opened tag is closed', () => {
    const item = (...content: unknown[]) => ({ type: 'listItem', content });
    const para = (t: string) => ({ type: 'paragraph', content: [{ type: 'text', text: t }] });
    const blocks = richTextToBlocks({
      type: 'doc',
      content: [
        {
          type: 'bulletList',
          content: [
            item(para('x'), {
              type: 'orderedList',
              content: [item(para('y'), { type: 'bulletList', content: [item(para('z'))] })],
            }),
          ],
        },
        para('end'),
      ],
    });
    const html = blocksToXhtml(blocks);
    const opens = (html.match(/<(ul|ol|li)>/g) ?? []).length;
    const closes = (html.match(/<\/(ul|ol|li)>/g) ?? []).length;
    expect(opens).toBe(closes);
    expect(html.indexOf('</ul>')).toBeLessThan(html.indexOf('<p>end</p>'));
  });

  it('gives nothing for no blocks', () => {
    expect(blocksToXhtml([])).toBe('');
  });
});
