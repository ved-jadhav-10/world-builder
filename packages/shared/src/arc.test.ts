import { describe, expect, it } from 'vitest';
import { arcColumns, buildArc } from './arc';
import type { ManuscriptNode, Progression } from './types';

const node = (
  id: string,
  kind: ManuscriptNode['kind'],
  parentId: string | null,
  sortOrder: number,
): ManuscriptNode => ({
  id,
  kind,
  parentId,
  title: id,
  summary: '',
  sortOrder,
  wordCount: 0,
  povId: null,
  locationId: null,
  inWorldDate: '',
  inWorldDay: null,
  updatedAt: '2026-01-01T00:00:00.000Z',
});

const manuscript = [
  node('b', 'book', null, 0),
  node('c1', 'chapter', 'b', 0),
  node('c2', 'chapter', 'b', 1),
  node('s1', 'scene', 'c1', 0),
  node('s2', 'scene', 'c1', 1),
  node('s3', 'scene', 'c2', 0),
  node('loose', 'scene', 'b', 2),
];

let n = 0;
const change = (sceneId: string, changes: Progression['changes']): Progression => ({
  id: `p${++n}`,
  entityId: 'e',
  title: 't',
  note: '',
  sceneId,
  day: null,
  changes,
  visibility: 'gm',
  createdAt: `2026-01-01T00:00:${String(n).padStart(2, '0')}.000Z`,
  updatedAt: '2026-01-01T00:00:00.000Z',
});

describe('arc columns', () => {
  it('reads a chapter after its last scene, and a loose scene by itself', () => {
    const { columns } = arcColumns(manuscript, 'chapter');
    expect(columns.map((c) => [c.id, c.point.sceneIndex])).toEqual([
      ['c1', 1],
      ['c2', 2],
      ['loose', 3],
    ]);
  });

  it('offers every scene when asked', () => {
    expect(arcColumns(manuscript, 'scene').columns.map((c) => c.id)).toEqual([
      's1',
      's2',
      's3',
      'loose',
    ]);
  });
});

describe('arc rows', () => {
  const { columns, scenes } = arcColumns(manuscript, 'chapter');
  const build = (progressions: Progression[]) =>
    buildArc({
      entry: { name: 'Maren', aliases: [], summary: '', fields: { rank: 'Squire', home: 'Vael' } },
      fieldDefs: [
        { key: 'rank', label: 'Rank' },
        { key: 'home', label: 'Home' },
      ],
      links: [{ id: 'r1', label: 'friend of Dov' }],
      typeLabels: new Map([['t-rival', 'rival of']]),
      progressions,
      columns,
      scenes,
    });

  it('shows where a detail, a name and a link change, and where they hold', () => {
    const rows = build([
      change('s3', { fields: { rank: 'Captain' }, name: 'Captain Maren' }),
      change('s2', { relationships: [{ relationshipId: 'r1', typeId: 't-rival' }] }),
      change('loose', { relationships: [{ relationshipId: 'r1', ended: true }] }),
    ]);
    const by = (key: string) => rows.find((r) => r.key === key)!;
    expect(by('field:rank').cells).toEqual(['Squire', 'Captain', 'Captain']);
    expect(by('field:rank').changed).toEqual([false, true, false]);
    expect(by('name').cells).toEqual(['Maren', 'Captain Maren', 'Captain Maren']);
    expect(by('link:r1').cells).toEqual(['Now rival of', 'Now rival of', 'Ended']);
    expect(by('field:home').moves).toBe(false);
    expect(by('field:rank').moves).toBe(true);
  });

  it('marks a change in the first column against how the entry began', () => {
    const rows = build([change('s1', { fields: { home: null } })]);
    const home = rows.find((r) => r.key === 'field:home')!;
    expect(home.cells).toEqual(['—', '—', '—']);
    expect(home.changed).toEqual([true, false, false]);
  });
});
