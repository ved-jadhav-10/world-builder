import { describe, expect, it } from 'vitest';
import { fieldSchemaSchema, type FieldDefinition } from './schemas/entity-type';
import { describeFieldValue, parseFieldValues } from './fields';

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
