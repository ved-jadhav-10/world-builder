import { describe, expect, it } from 'vitest';
import { deriveSearchText } from './search';
import { hasSecretBlocks, stripSecretBlocks } from './secret-blocks';

const p = (text: string) => ({ type: 'paragraph', content: [{ type: 'text', text }] });
const secret = (...content: object[]) => ({ type: 'secretBlock', content });
const doc = (...content: object[]) => ({ type: 'doc', content });

describe('secret blocks', () => {
  it('finds them at any depth', () => {
    expect(hasSecretBlocks(doc(p('plain')))).toBe(false);
    expect(hasSecretBlocks(doc(p('a'), secret(p('b'))))).toBe(true);
    expect(hasSecretBlocks(doc({ type: 'blockquote', content: [secret(p('deep'))] }))).toBe(true);
    expect(hasSecretBlocks(null)).toBe(false);
  });

  it('removes them and keeps everything else in order', () => {
    const original = doc(p('Open'), secret(p('The king is a fraud.')), p('Also open'));
    const stripped = stripSecretBlocks(original) as { content: { content: { text: string }[] }[] };
    expect(stripped.content.map((n) => n.content[0]!.text)).toEqual(['Open', 'Also open']);
    // The original is untouched.
    expect(original.content).toHaveLength(3);
  });

  it('removes nested ones, and returns the same document when there are none', () => {
    const nested = doc({ type: 'blockquote', content: [p('quote'), secret(p('hidden'))] });
    expect(JSON.stringify(stripSecretBlocks(nested))).not.toContain('hidden');
    expect(JSON.stringify(stripSecretBlocks(nested))).toContain('quote');
    const plain = doc(p('x'));
    expect(stripSecretBlocks(plain)).toBe(plain);
    expect(stripSecretBlocks(null)).toBeNull();
  });

  it('turns an article that was all secret into nothing', () => {
    expect(stripSecretBlocks(doc(secret(p('all of it'))))).toBeNull();
  });

  it('keeps secret words out of the search text', () => {
    const text = deriveSearchText({
      name: 'Throne',
      aliases: [],
      summary: '',
      fields: {},
      body: doc(p('A seat of oak'), secret(p('hides a trapdoor'))),
    });
    expect(text).toContain('oak');
    expect(text).not.toContain('trapdoor');
  });
});
