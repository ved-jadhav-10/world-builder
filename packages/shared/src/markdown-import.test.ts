import { describe, expect, it } from 'vitest';
import { richTextToMarkdown } from './markdown';
import {
  mapProperties,
  matchTypeKey,
  parseMarkdownNote,
  withPropertyList,
} from './markdown-import';
import type { FieldDefinition } from './schemas/entity-type';

const types = [
  { key: 'character', name: 'Character' },
  { key: 'location', name: 'Location' },
  { key: 'lore_article', name: 'Lore Article' },
  { key: 'ship', name: 'Ships of the line' },
];

describe('reading Markdown notes', () => {
  it('reads front-matter, drops a repeated title and collects wikilinks', () => {
    const note = parseMarkdownNote(
      'Characters/Mira Vey.md',
      [
        '---',
        'type: character',
        'aliases: [Mira, "The Barkeep"]',
        'tags:',
        '  - main-cast',
        '  - "#vesh"',
        'summary: Owner of the Gilded Eel.',
        '---',
        '# Mira Vey',
        '',
        'She runs [[The Gilded Eel]] in [[Locations/Vesh|the Salt City]] and owes **everyone**.',
        '',
        '## Manner',
        '- Dry',
        '- _Watchful_',
        '',
        '> The sea keeps our secrets.',
        '',
        'See [the guild](https://example.com/guild) and ![[portrait.png]].',
      ].join('\n'),
    );
    expect(note.name).toBe('Mira Vey');
    expect(note.typeHint).toBe('character');
    expect(note.aliases).toEqual(['Mira', 'The Barkeep']);
    expect(note.tags).toEqual(['main-cast', 'vesh']);
    expect(note.summary).toBe('Owner of the Gilded Eel.');
    expect(note.links).toEqual(['The Gilded Eel', 'Vesh']);
    const text = richTextToMarkdown(note.body);
    expect(text).not.toContain('# Mira Vey');
    expect(text).toContain('She runs The Gilded Eel in the Salt City and owes **everyone**.');
    expect(text).toContain('## Manner');
    expect(text).toContain('- Dry');
    expect(text).toContain('> The sea keeps our secrets.');
    expect(text).toContain('[the guild](https://example.com/guild)');
    expect(text).not.toContain('portrait');
  });

  it('falls back to the file name and the folder', () => {
    const note = parseMarkdownNote('Places\\Vesh.md', 'A harbour city.\nBuilt on a temple.');
    expect(note.name).toBe('Vesh');
    expect(note.typeHint).toBe('Places');
    expect(richTextToMarkdown(note.body)).toBe('A harbour city. Built on a temple.');
    expect(parseMarkdownNote('Loose.md', '').body).toBeNull();
    expect(parseMarkdownNote('Loose.md', '').typeHint).toBeNull();
  });

  it('never turns an unsafe link into a link', () => {
    const note = parseMarkdownNote(
      'x.md',
      '[click](javascript:alert(1)) and [ok](https://a.example)',
    );
    const marks = JSON.stringify(note.body);
    expect(marks).not.toContain('javascript');
    expect(marks).toContain('https://a.example');
  });

  it('matches a hint to one of the world’s types', () => {
    expect(matchTypeKey('Characters', types, 'lore_article')).toBe('character');
    expect(matchTypeKey('location', types, 'lore_article')).toBe('location');
    expect(matchTypeKey('NPCs', types, 'lore_article')).toBe('character');
    expect(matchTypeKey('Cities', types, 'lore_article')).toBe('location');
    expect(matchTypeKey('Ships of the line', types, 'lore_article')).toBe('ship');
    expect(matchTypeKey('Recipes', types, 'lore_article')).toBe('lore_article');
    expect(matchTypeKey(null, types, 'missing')).toBe('character');
  });
});

describe('properties', () => {
  const schema: FieldDefinition[] = [
    { key: 'age', label: 'Age', type: 'number' },
    { key: 'life_status', label: 'Life status', type: 'select', options: ['Alive', 'Dead'] },
    { key: 'home', label: 'Hometown', type: 'text' },
    { key: 'traits', label: 'Traits', type: 'multi_select', options: ['Dry', 'Kind', 'Wary'] },
    { key: 'ally', label: 'Is an ally', type: 'boolean' },
    { key: 'site', label: 'Website', type: 'url' },
    { key: 'moon', label: 'Moon', type: 'date' },
  ];

  it('are every front-matter line the importer does not already use, as written', () => {
    const note = parseMarkdownNote(
      'x.md',
      [
        '---',
        'type: character',
        'Age: 41',
        'Life status: alive',
        'created: 2026-01-01',
        'cssclasses: [wide]',
        'empty:',
        '---',
        'Body',
      ].join('\n'),
    );
    expect(note.properties).toEqual([
      ['Age', '41'],
      ['Life status', 'alive'],
    ]);
  });

  it('go into the fields they name when the value fits, and come back otherwise', () => {
    const { fields, rest } = mapProperties(
      [
        ['Age', '1,041'],
        ['life status', 'ALIVE'],
        ['Hometown', 'Vesh'],
        ['traits', 'dry; Wary'],
        ['is an ally', 'Yes'],
        ['Website', 'example.com'],
        ['Moon', 'Third moon'],
        ['Mood', 'Wistful'],
      ],
      schema,
    );
    expect(fields).toEqual({
      age: 1041,
      life_status: 'Alive',
      home: 'Vesh',
      traits: ['Dry', 'Wary'],
      ally: true,
    });
    expect(rest).toEqual([
      ['Website', 'example.com'],
      ['Moon', 'Third moon'],
      ['Mood', 'Wistful'],
    ]);
  });

  it('leave what does not fit: a word for a number, a choice that is not offered', () => {
    const { fields, rest } = mapProperties(
      [
        ['Age', 'about forty'],
        ['Life status', 'Missing'],
        ['Traits', 'Dry, Cruel'],
        ['Hometown', 'Vesh'],
        ['hometown', 'Elsewhere'],
      ],
      schema,
    );
    expect(fields).toEqual({ home: 'Vesh' });
    expect(rest.map(([label]) => label)).toEqual(['Age', 'Life status', 'Traits', 'hometown']);
  });

  it('are listed at the top of the article when they are left over', () => {
    const body = parseMarkdownNote('x.md', 'Hello there.').body;
    const withList = withPropertyList(body, [['Mood', 'Wistful']]);
    expect(JSON.stringify(withList)).toMatch(/^\{"type":"doc","content":\[\{"type":"bulletList"/);
    expect(JSON.stringify(withList)).toContain('Hello there.');
    expect(withPropertyList(body, [])).toBe(body);
    expect(withPropertyList(null, [['A', 'b']])).toMatchObject({ type: 'doc' });
  });
});
