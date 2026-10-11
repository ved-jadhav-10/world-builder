import { describe, expect, it } from 'vitest';
import { deriveSearchText, richTextToPlainText } from './search';
import { slugify } from './slug';

describe('richTextToPlainText', () => {
  it('collects text from nested nodes', () => {
    const doc = {
      type: 'doc',
      content: [
        { type: 'paragraph', content: [{ type: 'text', text: 'Mira keeps' }] },
        { type: 'paragraph', content: [{ type: 'text', text: 'the Gilded Eel.' }] },
      ],
    };
    expect(richTextToPlainText(doc)).toBe('Mira keeps the Gilded Eel.');
  });

  it('handles empty documents', () => {
    expect(richTextToPlainText(null)).toBe('');
  });
});

describe('deriveSearchText', () => {
  it('joins name, aliases, summary, body and text fields', () => {
    const text = deriveSearchText({
      name: 'Mira',
      aliases: ['The Barkeep'],
      summary: 'Owner of a tavern',
      body: { type: 'doc', content: [{ type: 'text', text: 'Former smuggler' }] },
      fields: { status: 'alive', traits: ['sly'], age: 31 },
    });
    expect(text).toBe('Mira The Barkeep Owner of a tavern Former smuggler alive sly');
  });
});

describe('slugify', () => {
  it('makes URL-safe slugs', () => {
    expect(slugify('The Gilded Eel!')).toBe('the-gilded-eel');
    expect(slugify('Ébène  Court')).toBe('ebene-court');
    expect(slugify('Lore Article', '_')).toBe('lore_article');
    expect(slugify('!!!')).toBe('');
  });
});
