import { describe, expect, it } from 'vitest';
import { redactWorldExport } from './export-redact';
import type { WorldExport } from './types';

const base = {
  format: 'atlas-ink.world',
  version: 1,
  exportedAt: '2026-01-01T00:00:00.000Z',
  world: { id: 'w', name: 'W', slug: 'w', description: '', createdAt: '' },
  entityTypes: [],
  relationshipTypes: [],
  tags: [],
  entities: [],
  relationships: [],
  manuscript: [{ id: 'n' }],
  atlas: { maps: [], features: [], layers: [] },
  calendar: null,
  progressions: [],
  gallery: [],
  rollTables: [],
  plotBoards: [{ id: 'b' }],
  handouts: [],
  todos: [{ id: 't' }],
  boards: [],
  entryTemplates: [{ id: 'e' }],
  comments: [{ id: 'c' }],
  diplomacy: [{ id: 'd' }],
} as unknown as WorldExport;

const withMaps = (): WorldExport =>
  ({
    ...base,
    entities: [
      { id: 'e1', visibility: 'public', body: null, tagIds: [] },
      { id: 'e2', visibility: 'gm', body: null, tagIds: [] },
    ],
    atlas: {
      maps: [
        {
          id: 'open',
          visibility: 'player',
          fogEnabled: false,
          entityId: 'e2',
          entity: { id: 'e2' },
        },
        { id: 'fogged', visibility: 'player', fogEnabled: true, entityId: null, entity: null },
        { id: 'secret', visibility: 'gm', fogEnabled: false, entityId: null, entity: null },
      ],
      features: [
        {
          id: 'f1',
          mapId: 'open',
          visibility: 'player',
          gmNotes: 'ambush!',
          entityId: 'e2',
          entity: { id: 'e2' },
        },
        { id: 'f2', mapId: 'open', visibility: 'gm', gmNotes: '', entityId: null, entity: null },
        {
          id: 'f3',
          mapId: 'fogged',
          visibility: 'player',
          gmNotes: '',
          entityId: null,
          entity: null,
        },
        {
          id: 'f4',
          mapId: 'secret',
          visibility: 'player',
          gmNotes: '',
          entityId: null,
          entity: null,
        },
      ],
      layers: [
        { id: 'l1', mapId: 'open' },
        { id: 'l2', mapId: 'fogged' },
      ],
    },
  }) as unknown as WorldExport;

describe('redactWorldExport', () => {
  it('returns the GM copy untouched', () => {
    const data = withMaps();
    expect(redactWorldExport(data, 'gm')).toBe(data);
  });

  it('keeps fogged maps bare, drops hidden maps and GM notes, and unlinks hidden entries', () => {
    const out = redactWorldExport(withMaps(), 'player');
    expect(out.atlas.maps.map((m) => m.id)).toEqual(['open', 'fogged']);
    expect(out.atlas.maps[0]).toMatchObject({ entityId: null, entity: null });
    expect(out.atlas.features.map((f) => f.id)).toEqual(['f1']);
    expect(out.atlas.features[0]).toMatchObject({ gmNotes: '', entityId: null, entity: null });
    expect(out.atlas.layers.map((l) => l.id)).toEqual(['l1']);
  });

  it('always leaves out the author workspace', () => {
    const out = redactWorldExport(withMaps(), 'public');
    expect(out).toMatchObject({
      manuscript: [],
      plotBoards: [],
      todos: [],
      entryTemplates: [],
      comments: [],
      diplomacy: [],
    });
    expect(out.entities.map((e) => e.id)).toEqual(['e1']);
    expect(out.atlas.maps).toEqual([]);
  });
});

describe('redactWorldExport and GM-only fields', () => {
  it('drops the values and the definitions for everyone but the GM', () => {
    const data = {
      ...base,
      entityTypes: [
        {
          id: 't1',
          fieldSchema: [
            { key: 'age', label: 'Age', type: 'number' },
            { key: 'true_name', label: 'True name', type: 'text', gmOnly: true },
          ],
        },
      ],
      entities: [
        {
          id: 'e1',
          typeId: 't1',
          visibility: 'public',
          body: null,
          tagIds: [],
          fields: { age: 9, true_name: 'Zarahel' },
        },
      ],
      progressions: [
        {
          id: 'p1',
          entityId: 'e1',
          visibility: 'public',
          changes: { fields: { age: 10, true_name: 'Zed' } },
        },
      ],
    } as unknown as WorldExport;
    const out = redactWorldExport(data, 'player');
    expect(out.entities[0]!.fields).toEqual({ age: 9 });
    expect(out.entityTypes[0]!.fieldSchema.map((f) => f.key)).toEqual(['age']);
    expect(out.progressions[0]!.changes.fields).toEqual({ age: 10 });
    expect(JSON.stringify(out)).not.toContain('Zarahel');
    expect(JSON.stringify(out)).not.toContain('Zed');
    expect(redactWorldExport(data, 'gm')).toBe(data);
  });
});
