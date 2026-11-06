import { describe, expect, it } from 'vitest';
import { fieldSchemaSchema, type FieldDefinition } from './schemas/entity-type';
import {
  describeFieldValue,
  fieldSchemaFor,
  fieldValuesFor,
  gmOnlyFieldKeys,
  parseFieldValues,
} from './fields';
import { deriveSearchText } from './search';

const schema: FieldDefinition[] = [
  { key: 'age', label: 'Age', type: 'number' },
  { key: 'status', label: 'Status', type: 'select', options: ['alive', 'dead'] },
  { key: 'traits', label: 'Traits', type: 'multi_select', options: ['brave', 'sly'] },
  { key: 'bio', label: 'Bio', type: 'long_text' },
  { key: 'wiki', label: 'Wiki', type: 'url' },
  { key: 'secret', label: 'Secret', type: 'boolean' },
];

describe('parseFieldValues', () => {
  it('accepts valid values and drops empty ones', () => {
    const result = parseFieldValues(schema, {
      age: 31,
      status: 'alive',
      traits: [],
      bio: '',
      wiki: 'https://example.com/mira',
      secret: false,
    });
    expect(result).toEqual({
      age: 31,
      status: 'alive',
      wiki: 'https://example.com/mira',
      secret: false,
    });
  });

  it('strips keys that are not in the schema', () => {
    expect(parseFieldValues(schema, { age: 2, removedField: 'x' })).toEqual({ age: 2 });
  });

  it('rejects values of the wrong type or outside the options', () => {
    expect(() => parseFieldValues(schema, { age: 'old' })).toThrow();
    expect(() => parseFieldValues(schema, { status: 'undead' })).toThrow();
    expect(() => parseFieldValues(schema, { traits: ['brave', 'loud'] })).toThrow();
  });

  it('only allows http(s) links', () => {
    expect(() => parseFieldValues(schema, { wiki: 'javascript:alert(1)' })).toThrow();
  });
});

describe('fieldSchemaSchema', () => {
  it('requires options for choice fields', () => {
    const result = fieldSchemaSchema.safeParse([{ key: 'mood', label: 'Mood', type: 'select' }]);
    expect(result.success).toBe(false);
  });

  it('rejects duplicate keys', () => {
    const result = fieldSchemaSchema.safeParse([
      { key: 'age', label: 'Age', type: 'number' },
      { key: 'age', label: 'Age again', type: 'text' },
    ]);
    expect(result.success).toBe(false);
  });
});

describe('character extras', () => {
  const extras: FieldDefinition[] = [
    { key: 'palette', label: 'Palette', type: 'palette' },
    { key: 'abilities', label: 'Abilities', type: 'abilities' },
    { key: 'interview', label: 'Interview', type: 'qa' },
  ];

  it('keeps colours, abilities with charges and questions', () => {
    const result = parseFieldValues(extras, {
      palette: ['#AA0000', '#00ff00'],
      abilities: [
        { name: 'Second wind', charges: { max: 2, current: 1, recharge: 'long rest' } },
        { name: 'Darkvision' },
      ],
      interview: [{ question: 'What do you fear?', answer: 'Deep water.' }],
    });
    expect(result.palette).toEqual(['#aa0000', '#00ff00']);
    expect(result.abilities).toEqual([
      {
        name: 'Second wind',
        description: '',
        charges: { max: 2, current: 1, recharge: 'long rest' },
      },
      { name: 'Darkvision', description: '', charges: null },
    ]);
    expect(result.interview).toEqual([{ question: 'What do you fear?', answer: 'Deep water.' }]);
  });

  it('refuses bad colours, charges above the maximum, and unnamed abilities', () => {
    expect(() => parseFieldValues(extras, { palette: ['red'] })).toThrow();
    expect(() => parseFieldValues(extras, { palette: Array(13).fill('#000000') })).toThrow();
    expect(() =>
      parseFieldValues(extras, { abilities: [{ name: 'X', charges: { max: 1, current: 2 } }] }),
    ).toThrow();
    expect(() => parseFieldValues(extras, { abilities: [{ name: '  ' }] })).toThrow();
    expect(() => parseFieldValues(extras, { interview: [{ question: '' }] })).toThrow();
  });

  it('describes the lists in words', () => {
    expect(describeFieldValue(['#aa0000', '#00ff00'])).toBe('#aa0000, #00ff00');
    expect(
      describeFieldValue([
        { name: 'Second wind', charges: { max: 2, current: 1 } },
        { name: 'Darkvision', charges: null },
      ]),
    ).toBe('Second wind (2 charges); Darkvision');
    expect(
      describeFieldValue([{ question: 'Fear?', answer: 'Water.' }, { question: 'Hope?' }]),
    ).toBe('Fear? Water.; Hope?');
    expect(describeFieldValue([])).toBe('');
    expect(describeFieldValue(true)).toBe('Yes');
  });
});

describe('shop wares', () => {
  const shop: FieldDefinition[] = [{ key: 'wares', label: 'Wares', type: 'inventory' }];

  it('keeps items with a price and optional stock, and fills the blanks', () => {
    const result = parseFieldValues(shop, {
      wares: [{ name: 'Rope', price: ' 1 gp ', stock: 3 }, { name: 'Lantern' }],
    });
    expect(result.wares).toEqual([
      { name: 'Rope', price: '1 gp', stock: 3, description: '' },
      { name: 'Lantern', price: '', stock: null, description: '' },
    ]);
  });

  it('refuses unnamed items, negative stock and fractions', () => {
    expect(() => parseFieldValues(shop, { wares: [{ name: ' ' }] })).toThrow();
    expect(() => parseFieldValues(shop, { wares: [{ name: 'A', stock: -1 }] })).toThrow();
    expect(() => parseFieldValues(shop, { wares: [{ name: 'A', stock: 1.5 }] })).toThrow();
    expect(() => parseFieldValues(shop, { wares: Array(101).fill({ name: 'A' }) })).toThrow();
  });

  it('describes wares with price and stock', () => {
    expect(
      describeFieldValue([
        { name: 'Rope', price: '1 gp', stock: 3 },
        { name: 'Lantern', price: '', stock: null },
        { name: 'Map', price: '5 sp', stock: 0 },
      ]),
    ).toBe('Rope (1 gp, 3 in stock); Lantern; Map (5 sp, 0 in stock)');
  });
});

describe('labelled links', () => {
  const music: FieldDefinition[] = [{ key: 'soundtrack', label: 'Soundtrack', type: 'links' }];

  it('keeps http(s) links with a name', () => {
    const result = parseFieldValues(music, {
      soundtrack: [
        { label: ' Tavern ', url: 'https://open.spotify.com/track/1' },
        { url: 'http://example.com/a' },
      ],
    });
    expect(result.soundtrack).toEqual([
      { label: 'Tavern', url: 'https://open.spotify.com/track/1' },
      { label: '', url: 'http://example.com/a' },
    ]);
  });

  it('refuses other schemes, blanks and extra keys', () => {
    expect(() =>
      parseFieldValues(music, { soundtrack: [{ url: 'javascript:alert(1)' }] }),
    ).toThrow();
    expect(() => parseFieldValues(music, { soundtrack: [{ url: '' }] })).toThrow();
    expect(() => parseFieldValues(music, { soundtrack: [{ url: 'ftp://x.example/a' }] })).toThrow();
    expect(() =>
      parseFieldValues(music, { soundtrack: [{ url: 'https://a.example', extra: 1 }] }),
    ).toThrow();
  });

  it('describes links by name and address', () => {
    expect(
      describeFieldValue([
        { label: 'Tavern', url: 'https://a.example' },
        { label: '', url: 'https://b.example' },
      ]),
    ).toBe('Tavern (https://a.example); https://b.example');
  });
});

describe('GM-only fields', () => {
  const sheet: FieldDefinition[] = [
    { key: 'age', label: 'Age', type: 'number' },
    { key: 'true_name', label: 'True name', type: 'text', gmOnly: true },
  ];
  const values = { age: 30, true_name: 'Zarahel' };

  it('are told apart, and hidden from everyone but the GM', () => {
    expect(gmOnlyFieldKeys(sheet)).toEqual(['true_name']);
    expect(fieldSchemaFor(sheet, 'gm')).toHaveLength(2);
    expect(fieldSchemaFor(sheet, 'player').map((f) => f.key)).toEqual(['age']);
    expect(fieldValuesFor(sheet, values, 'gm')).toBe(values);
    for (const audience of ['player', 'reader', 'public'] as const) {
      expect(fieldValuesFor(sheet, values, audience)).toEqual({ age: 30 });
    }
  });

  it('are accepted by the type schema and left out of search text when asked', () => {
    expect(fieldSchemaSchema.safeParse(sheet).success).toBe(true);
    const entity = { name: 'Mira', aliases: [], summary: '', body: null, fields: values };
    expect(deriveSearchText(entity)).toContain('Zarahel');
    expect(deriveSearchText(entity, ['true_name'])).not.toContain('Zarahel');
  });
});
