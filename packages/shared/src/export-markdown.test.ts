import { describe, expect, it } from 'vitest';
import { dateToDay, DEFAULT_CALENDAR } from './calendar';
import { safeName, worldToMarkdown } from './export-markdown';
import type { WorldExport } from './types';

const day = (year: number, month: number, d: number) =>
  dateToDay(DEFAULT_CALENDAR, { year, month, day: d });
const doc = (text: string) => ({
  type: 'doc' as const,
  content: [{ type: 'paragraph', content: [{ type: 'text', text }] }],
});

/** A small world with a bit of everything, including awkward names. */
function world(): WorldExport {
  const characterType = {
    id: 't-char',
    key: 'character',
    name: 'Character',
    icon: 'user',
    color: '#e11d48',
    isBuiltin: true,
    sortOrder: 0,
    startLabel: 'Born',
    endLabel: 'Died',
    fieldSchema: [
      { key: 'age', label: 'Age', type: 'text' as const },
      { key: 'alive', label: 'Alive', type: 'boolean' as const },
      { key: 'moods', label: 'Moods', type: 'multi_select' as const, options: ['calm', 'tense'] },
    ],
  };
  const placeType = {
    ...characterType,
    id: 't-place',
    key: 'location',
    name: 'Location',
    startLabel: 'Founded',
    endLabel: 'Abandoned',
    fieldSchema: [],
  };
  const entity = (id: string, typeId: string, name: string, extra: object = {}) => ({
    id,
    typeId,
    name,
    aliases: [] as string[],
    summary: '',
    visibility: 'gm' as const,
    fields: {},
    body: null,
    startDay: null,
    endDay: null,
    tagIds: [] as string[],
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...extra,
  });
  const node = (
    id: string,
    kind: 'book' | 'part' | 'chapter' | 'scene',
    parentId: string | null,
    title: string,
    sortOrder = 0,
    extra: object = {},
  ) => ({
    id,
    kind,
    parentId,
    title,
    summary: '',
    sortOrder,
    wordCount: 0,
    povId: null,
    locationId: null,
    inWorldDate: '',
    inWorldDay: null,
    updatedAt: '2026-01-01T00:00:00.000Z',
    body: null,
    ...extra,
  });
  return {
    format: 'atlas-ink.world',
    version: 1,
    exportedAt: '2026-10-11T10:00:00.000Z',
    world: {
      id: 'w',
      name: 'Aerth',
      slug: 'aerth',
      description: 'A stormy archipelago.',
      createdAt: '2026-01-01T00:00:00.000Z',
    },
    entityTypes: [characterType, placeType],
    relationshipTypes: [
      {
        id: 'r-member',
        key: 'member_of',
        label: 'member of',
        inverseLabel: 'has member',
        isBuiltin: true,
      },
    ],
    tags: [{ id: 'tag1', name: 'Main cast', color: '#e11d48' }],
    entities: [
      entity('e-mira', 't-char', 'Mira Vey', {
        aliases: ['Mira', 'The "Barkeep"'],
        summary: 'Owner of the Eel.\nA former pilot.',
        fields: { age: '41', alive: true, moods: ['calm', 'tense'] },
        body: doc('She counts the ships *every* morning.'),
        startDay: day(273, 2, 9),
        tagIds: ['tag1'],
        visibility: 'player',
      }),
      entity('e-eel', 't-place', 'The Gilded Eel: a tavern?'),
      entity('e-eel2', 't-place', 'the gilded eel: a tavern?'), // same name once cleaned, other case
      entity('e-guild', 't-place', 'CON'), // a reserved name on Windows
    ],
    relationships: [
      {
        id: 'rel1',
        sourceId: 'e-mira',
        targetId: 'e-guild',
        typeId: 'r-member',
        notes: 'Left on bad terms',
        validFromDay: day(291, 0, 1),
        validToDay: day(306, 4, 20),
      },
    ],
    manuscript: [
      node('b1', 'book', null, 'The Salt Road'),
      node('c2', 'chapter', 'b1', 'Second: "Rising"', 1),
      node('c1', 'chapter', 'b1', 'First', 0),
      node('s1', 'scene', 'c1', 'At the docks', 0, {
        body: doc('Fog rolled in.'),
        povId: 'e-mira',
        locationId: 'e-eel',
        inWorldDay: day(314, 9, 3),
        wordCount: 3,
      }),
      node('s2', 'scene', 'c1', 'At the docks', 1, { wordCount: 0 }), // same title twice
    ],
    atlas: {
      maps: [
        {
          id: 'm1',
          parentId: null,
          name: 'Aerth',
          description: 'The whole world.',
          status: 'ready',
          error: '',
          width: 4000,
          height: 3000,
          entityId: null,
          entity: null,
          visibility: 'player',
          featureCount: 1,
          createdAt: '',
          updatedAt: '',
        },
        {
          id: 'm2',
          parentId: 'm1',
          name: 'Vesh',
          description: '',
          status: 'ready',
          error: '',
          width: 1000,
          height: 1000,
          entityId: 'e-eel',
          entity: null,
          visibility: 'gm',
          featureCount: 0,
          createdAt: '',
          updatedAt: '',
        },
      ],
      features: [
        {
          id: 'f1',
          mapId: 'm1',
          kind: 'pin',
          points: [[0.25, 0.5]],
          label: 'Vesh',
          notes: '',
          entityId: 'e-eel',
          entity: null,
          linkMapId: 'm2',
          icon: null,
          color: null,
          size: 'md',
          lineStyle: 'solid',
          minZoom: 0,
          visibility: 'gm',
          updatedAt: '',
        },
      ],
    },
    calendar: null,
    progressions: [
      {
        id: 'p1',
        entityId: 'e-mira',
        title: 'Buys the Eel',
        note: "Spent her pilot's purse.",
        sceneId: null,
        day: day(306, 4, 20),
        changes: { fields: { age: '33', alive: null }, summary: 'x' },
        visibility: 'gm',
        createdAt: '',
        updatedAt: '',
      },
      {
        id: 'p2',
        entityId: 'e-mira',
        title: 'Seen at dawn',
        note: '',
        sceneId: 's1',
        day: null,
        changes: {},
        visibility: 'gm',
        createdAt: '',
        updatedAt: '',
      },
    ],
    gallery: [
      {
        id: 'img1',
        entityId: 'e-mira',
        entityName: 'Mira Vey',
        caption: 'Mira, aged 41',
        visibility: 'gm',
        sceneId: null,
        day: null,
        isPortrait: true,
        width: 10,
        height: 10,
        bytes: 1,
        createdAt: '',
      },
      {
        id: 'img2',
        entityId: null,
        entityName: null,
        caption: '',
        visibility: 'gm',
        sceneId: null,
        day: null,
        isPortrait: false,
        width: 10,
        height: 10,
        bytes: 1,
        createdAt: '',
      },
    ],
  };
}

const imagePaths = new Map([
  ['img1', 'Gallery/img1.webp'],
  ['img2', 'Gallery/img2.webp'],
]);
const byPath = (files: { path: string; content: string }[]) =>
  new Map(files.map((f) => [f.path, f.content]));

describe('safeName', () => {
  it('removes characters that are not allowed in file names', () => {
    expect(safeName('a<b>c:d"e/f\\g|h?i*j')).toBe('a-b-c-d-e-f-g-h-i-j');
    expect(safeName('  spaced   out  ')).toBe('spaced out');
    expect(safeName('trailing dots...')).toBe('trailing dots');
    expect(safeName('.hidden')).toBe('hidden');
    expect(safeName('')).toBe('Untitled');
    expect(safeName('???', 'Fallback')).toBe('---');
    expect(safeName('nul')).toBe('nul_');
    expect(safeName('x'.repeat(200))).toHaveLength(80);
  });
});

describe('worldToMarkdown', () => {
  it('writes one note per entry in a folder per type, with front-matter', () => {
    const files = byPath(worldToMarkdown(world(), { imagePaths }));
    const mira = files.get('aerth/Codex/Character/Mira Vey.md')!;
    expect(mira).toBeDefined();
    expect(mira.startsWith('---\nid: "e-mira"\n')).toBe(true);
    expect(mira).toContain('type: "Character"');
    expect(mira).toContain('aliases: ["Mira","The \\"Barkeep\\""]'); // quotes escaped for YAML
    expect(mira).toContain('tags: ["Main cast"]');
    expect(mira).toContain('visibility: "player"');
    expect(mira).toContain('born: "9 Seedtide, 273 AF"');
    expect(mira).toContain('born_day: ');
    expect(mira).toContain('fields:\n  age: "41"\n  alive: true\n  moods: ["calm","tense"]');
    // The body: heading, quoted summary, text.
    expect(mira).toContain(
      '# Mira Vey\n\n> Owner of the Eel.\n> A former pilot.\n\nShe counts the ships \\*every\\* morning.',
    );
    expect(mira).toContain(
      '## Details\n\n- **Age:** 41\n- **Alive:** Yes\n- **Moods:** calm, tense',
    );
  });

  it('lists relationships with periods, changes over time, maps and the gallery', () => {
    const mira = byPath(worldToMarkdown(world(), { imagePaths })).get(
      'aerth/Codex/Character/Mira Vey.md',
    )!;
    expect(mira).toContain(
      '- member of [[Codex/Location/CON_|CON]] (1 Frostmoon, 291 AF to 20 Greenwane, 306 AF) — Left on bad terms',
    );
    expect(mira).toContain('## Changes over time');
    expect(mira).toContain(
      "- **Buys the Eel** (20 Greenwane, 306 AF) — Age: 33; Alive cleared; summary changed\n  Spent her pilot's purse.",
    );
    expect(mira).toContain(
      '- **Seen at dawn** ([[Manuscript/01 The Salt Road/01 First/01 At the docks|At the docks]])',
    );
    expect(mira).toContain('## Gallery\n\n![[Gallery/img1.webp]]\n*Mira, aged 41*');
  });

  it('shows a link from both ends, using the inverse label from the far side', () => {
    const guild = byPath(worldToMarkdown(world())).get('aerth/Codex/Location/CON_.md')!;
    expect(guild).toContain(
      '- has member [[Codex/Character/Mira Vey|Mira Vey]] (1 Frostmoon, 291 AF to 20 Greenwane, 306 AF)',
    );
  });

  it('keeps names safe and unique, even when entries clash', () => {
    const paths = worldToMarkdown(world()).map((f) => f.path);
    // ":" and "?" are not allowed; two names that clean to the same text, ignoring case, get a
    // number, and the same one every time (the one with the lower ID keeps the plain name).
    expect(paths).toContain('aerth/Codex/Location/The Gilded Eel- a tavern-.md');
    expect(paths).toContain('aerth/Codex/Location/the gilded eel- a tavern- (2).md');
    expect(paths).toContain('aerth/Codex/Location/CON_.md');
    expect(new Set(paths.map((p) => p.toLowerCase())).size).toBe(paths.length);
    expect(paths.every((p) => !/[<>:"\\|?*]/.test(p.replace('aerth/', '')))).toBe(true);
  });

  it('writes the manuscript in reading order, numbered, with contents', () => {
    const files = byPath(worldToMarkdown(world()));
    const scene = files.get('aerth/Manuscript/01 The Salt Road/01 First/01 At the docks.md')!;
    expect(scene).toContain('chapter: "First"');
    expect(scene).toContain('pov: "Mira Vey"');
    expect(scene).toContain('date: "3 Rimewane, 314 AF"');
    expect(scene).toContain('# At the docks\n\nFog rolled in.');
    expect(scene).toContain('Point of view: [[Codex/Character/Mira Vey|Mira Vey]]');
    // Same title twice in a chapter: both survive, in order.
    expect(files.has('aerth/Manuscript/01 The Salt Road/01 First/02 At the docks.md')).toBe(true);
    expect(files.has('aerth/Manuscript/01 The Salt Road/02 Second- -Rising-')).toBe(false);
    const contents = files.get('aerth/Manuscript/Contents.md')!;
    expect(contents).toContain('- The Salt Road\n  - First\n  - Second: "Rising"');
    expect(contents).toContain('3 words in 2 scenes');
  });

  it('describes maps with their pins, and notes that images are left out', () => {
    const files = byPath(worldToMarkdown(world()));
    const aerth = files.get('aerth/Atlas/Aerth.md')!;
    expect(aerth).toContain('visibility: "player"');
    expect(aerth).toContain('The map image is not included');
    expect(aerth).toContain(
      '- **Vesh** (pin) at 25% across, 50% down, about [[Codex/Location/The Gilded Eel- a tavern-|The Gilded Eel: a tavern?]], opens [[Atlas/Vesh|Vesh]]',
    );
    expect(files.get('aerth/Atlas/Vesh.md')).toContain('Inside: [[Atlas/Aerth|Aerth]]');
  });

  it('writes a timeline in date order, grouped by year', () => {
    const timeline = byPath(worldToMarkdown(world())).get('aerth/Timeline.md')!;
    expect(timeline).toContain(
      '## 273 AF\n\n- 9 Seedtide, 273 AF — **Born:** [[Codex/Character/Mira Vey|Mira Vey]] (Character)',
    );
    expect(timeline).toContain(
      '## 314 AF\n\n- 3 Rimewane, 314 AF — **Scene:** [[Manuscript/01 The Salt Road/01 First/01 At the docks|At the docks]]',
    );
    expect(timeline.indexOf('273 AF')).toBeLessThan(timeline.indexOf('314 AF'));
  });

  it('describes the calendar and gives an overview', () => {
    const files = byPath(worldToMarkdown(world()));
    expect(files.get('aerth/Calendar.md')).toContain('1. Frostmoon: 30 days');
    expect(files.get('aerth/Calendar.md')).toContain('- Age of Founding (AF): year 1 is year 1');
    const readme = files.get('aerth/README.md')!;
    expect(readme).toContain('# Aerth');
    expect(readme).toContain('4 entries');
    expect(readme).toContain('2 scenes');
    expect(readme).toContain('2 maps');
  });

  it('includes pictures only when their files are being included', () => {
    const without = byPath(worldToMarkdown(world()));
    expect(without.get('aerth/Codex/Character/Mira Vey.md')).not.toContain('## Gallery');
    expect(without.has('aerth/Gallery/Gallery.md')).toBe(false);
    const withImages = byPath(worldToMarkdown(world(), { imagePaths }));
    expect(withImages.get('aerth/Gallery/Gallery.md')).toContain('![[Gallery/img2.webp]]');
  });

  it('only links to notes that exist', () => {
    const files = worldToMarkdown(world(), { imagePaths });
    const known = new Set(files.map((f) => f.path.replace(/^aerth\//, '').replace(/\.md$/, '')));
    const broken: string[] = [];
    for (const file of files) {
      for (const [, target] of file.content.matchAll(/\[\[([^\]|]+)(?:\|[^\]]*)?\]\]/g)) {
        // Image embeds point at files that are added separately.
        if (/\.(webp|png|jpe?g)$/.test(target!)) continue;
        if (!known.has(target!)) broken.push(`${file.path} -> ${target}`);
      }
    }
    expect(broken).toEqual([]);
  });

  it('copes with an empty world', () => {
    const empty: WorldExport = {
      ...world(),
      entities: [],
      relationships: [],
      manuscript: [],
      atlas: { maps: [], features: [] },
      progressions: [],
      gallery: [],
    };
    const paths = worldToMarkdown(empty)
      .map((f) => f.path)
      .sort();
    expect(paths).toEqual(['aerth/Calendar.md', 'aerth/README.md']);
  });
});
