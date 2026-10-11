import { describe, expect, it } from 'vitest';
import { fieldSchemaSchema, type FieldDefinition } from './schemas/entity-type';
import { parseFieldValues } from './fields';

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
    expect(result).toEqual({ age: 31, status: 'alive', wiki: 'https://example.com/mira', secret: false });
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
