import { describe, expect, it } from 'vitest';
import {
  applyProgressions,
  buildSceneIndex,
  isActiveAt,
  placeProgression,
  pointAtDay,
  pointAtScene,
} from './progressions';
import type { ManuscriptNode, Progression } from './types';

let counter = 0;
const node = (
  id: string,
  kind: ManuscriptNode['kind'],
  parentId: string | null,
  sortOrder: number,
  inWorldDay: number | null = null,
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
  inWorldDay,
  updatedAt: '2026-01-01T00:00:00.000Z',
});

/**
 * Book One has Part A (chapter c1: s1, s2) and chapter c2 (s3). Book Two has chapter c3 (s4).
 * Sort orders are deliberately not in id order, and s2 is a flashback to an earlier day.
 */
const manuscript: ManuscriptNode[] = [
  node('b2', 'book', null, 1),
  node('b1', 'book', null, 0),
  node('pA', 'part', 'b1', 0),
  node('c2', 'chapter', 'b1', 1),
  node('c1', 'chapter', 'pA', 0),
  node('s2', 'scene', 'c1', 1, 50),
  node('s1', 'scene', 'c1', 0, 100),
  node('s3', 'scene', 'c2', 0, 200),
  node('c3', 'chapter', 'b2', 0),
  node('s4', 'scene', 'c3', 0),
];
const scenes = buildSceneIndex(manuscript);

const progression = (
  title: string,
  anchor: { sceneId?: string; day?: number },
  changes: Progression['changes'] = {},
): Progression => ({
  id: `p${++counter}`,
  entityId: 'e1',
  title,
  note: '',
  sceneId: anchor.sceneId ?? null,
  day: anchor.day ?? null,
  changes,
  visibility: 'gm',
  createdAt: `2026-01-01T00:00:${String(counter).padStart(2, '0')}.000Z`,
  updatedAt: '2026-01-01T00:00:00.000Z',
});

const base = {
  fields: { title: 'Squire', home: 'Vael' } as Record<string, unknown>,
  summary: 'A young squire.',
};
const titles = (list: Progression[]) => list.map((p) => p.title);

describe('reading order', () => {
  it('walks books, parts and chapters by sort order, not by id or creation', () => {
    expect([...scenes.values()].map((s) => s.id)).toEqual(['s1', 's2', 's3', 's4']);
    expect(scenes.get('s3')).toMatchObject({ index: 2, day: 200 });
    expect(scenes.get('s4')).toMatchObject({ index: 3, day: null });
  });

  it('gives a point for a scene (both axes) and for a bare date', () => {
    expect(pointAtScene(scenes, 's2')).toEqual({ sceneIndex: 1, day: 50 });
    expect(pointAtScene(scenes, 's4')).toEqual({ sceneIndex: 3, day: null });
    expect(pointAtScene(scenes, 'gone')).toBeNull();
    expect(pointAtDay(75)).toEqual({ sceneIndex: null, day: 75 });
  });
});

describe('which progressions have happened', () => {
  it('compares scene anchors by reading order, even for a flashback', () => {
    const atS1 = progression('at s1', { sceneId: 's1' });
    const atS3 = progression('at s3', { sceneId: 's3' });
    const point = pointAtScene(scenes, 's2')!; // s2 is read after s1 but dated before it
    expect(placeProgression(atS1, point, scenes)).toBe('applied');
    expect(placeProgression(atS3, point, scenes)).toBe('later');
  });

  it('compares day anchors by day', () => {
    const p = progression('day 100', { day: 100 });
    expect(placeProgression(p, pointAtDay(99), scenes)).toBe('later');
    expect(placeProgression(p, pointAtDay(100), scenes)).toBe('applied');
    expect(placeProgression(p, pointAtDay(101), scenes)).toBe('applied');
  });

  it('compares a scene anchor with a date through the scene day', () => {
    const atS3 = progression('at s3', { sceneId: 's3' }); // day 200
    expect(placeProgression(atS3, pointAtDay(199), scenes)).toBe('later');
    expect(placeProgression(atS3, pointAtDay(200), scenes)).toBe('applied');
    // And a date anchor against a scene point uses that scene's day.
    const day150 = progression('day 150', { day: 150 });
    expect(placeProgression(day150, pointAtScene(scenes, 's1')!, scenes)).toBe('later'); // day 100
    expect(placeProgression(day150, pointAtScene(scenes, 's3')!, scenes)).toBe('applied'); // day 200
  });

  it('reports what cannot be placed instead of guessing', () => {
    const day150 = progression('day 150', { day: 150 });
    // s4 has no date, so a date-anchored change can't be compared with it.
    expect(placeProgression(day150, pointAtScene(scenes, 's4')!, scenes)).toBe('unplaced');
    // An undated scene can't be compared with a bare date either.
    const atS4 = progression('at s4', { sceneId: 's4' });
    expect(placeProgression(atS4, pointAtDay(500), scenes)).toBe('unplaced');
    // A deleted scene, and a progression with no anchor at all.
    expect(
      placeProgression(progression('ghost', { sceneId: 'deleted' }), pointAtDay(1), scenes),
    ).toBe('unplaced');
    expect(placeProgression(progression('none', {}), pointAtDay(1), scenes)).toBe('unplaced');
  });
});

describe('applying progressions', () => {
  it('returns the entry unchanged when nothing has happened yet', () => {
    const later = progression('later', { sceneId: 's3' }, { fields: { title: 'Knight' } });
    const result = applyProgressions(base, [later], pointAtScene(scenes, 's1')!, scenes);
    expect(result).toMatchObject({ fields: base.fields, summary: base.summary, applied: [] });
    expect(titles(result.later)).toEqual(['later']);
  });

  it('applies field changes in order, later ones winning', () => {
    const knighted = progression('Knighted', { sceneId: 's2' }, { fields: { title: 'Knight' } });
    const promoted = progression(
      'Promoted',
      { sceneId: 's3' },
      { fields: { title: 'Captain', rank: 3 } },
    );
    const result = applyProgressions(
      base,
      [promoted, knighted],
      pointAtScene(scenes, 's4')!,
      scenes,
    );
    expect(result.fields).toEqual({ title: 'Captain', home: 'Vael', rank: 3 });
    expect(titles(result.applied)).toEqual(['Knighted', 'Promoted']);
    // Partway through, only the first has happened.
    const mid = applyProgressions(base, [promoted, knighted], pointAtScene(scenes, 's2')!, scenes);
    expect(mid.fields).toEqual({ title: 'Knight', home: 'Vael' });
  });

  it('clears a field set to null, and replaces the summary', () => {
    const exiled = progression(
      'Exiled',
      { day: 10 },
      { fields: { home: null }, summary: 'An exile.' },
    );
    const result = applyProgressions(base, [exiled], pointAtDay(10), scenes);
    expect(result.fields).toEqual({ title: 'Squire' });
    expect(result.summary).toBe('An exile.');
    expect(base.fields).toEqual({ title: 'Squire', home: 'Vael' }); // the original is untouched
  });

  it('can blank the summary on purpose', () => {
    const result = applyProgressions(
      base,
      [progression('Forgotten', { day: 1 }, { summary: '' })],
      pointAtDay(1),
      scenes,
    );
    expect(result.summary).toBe('');
  });

  it('orders by reading order when reading a scene, and by day when reading a date', () => {
    // s1 (read first, day 100) and s2 (read second, but a flashback to day 50).
    const first = progression('from s1', { sceneId: 's1' }, { fields: { mood: 'first' } });
    const second = progression('from s2', { sceneId: 's2' }, { fields: { mood: 'second' } });
    const reading = applyProgressions(base, [first, second], pointAtScene(scenes, 's3')!, scenes);
    expect(titles(reading.applied)).toEqual(['from s1', 'from s2']);
    expect(reading.fields.mood).toBe('second'); // what the reader learned last
    const world = applyProgressions(base, [first, second], pointAtDay(300), scenes);
    expect(titles(world.applied)).toEqual(['from s2', 'from s1']);
    expect(world.fields.mood).toBe('first'); // what is true in-world at the latest date
  });

  it('breaks ties by the order they were written', () => {
    const a = progression('A', { day: 5 }, { fields: { x: 'a' } });
    const b = progression('B', { day: 5 }, { fields: { x: 'b' } });
    expect(applyProgressions(base, [b, a], pointAtDay(5), scenes).fields.x).toBe('b');
  });

  it('sorts unplaceable ones out of the result', () => {
    const dated = progression('dated', { day: 5 }, { fields: { x: 1 } });
    const result = applyProgressions(base, [dated], pointAtScene(scenes, 's4')!, scenes);
    expect(result.applied).toEqual([]);
    expect(titles(result.unplaced)).toEqual(['dated']);
    expect(result.fields).toEqual(base.fields);
  });
});

describe('dated links', () => {
  it('holds between its dates, inclusive, with open ends', () => {
    const at = pointAtDay(100);
    expect(isActiveAt(50, 150, at)).toBe(true);
    expect(isActiveAt(100, 100, at)).toBe(true);
    expect(isActiveAt(101, null, at)).toBe(false);
    expect(isActiveAt(null, 99, at)).toBe(false);
    expect(isActiveAt(null, null, at)).toBe(true);
  });

  it('shows everything when there is no day to go by', () => {
    expect(isActiveAt(50, 60, null)).toBe(true);
    expect(isActiveAt(50, 60, { sceneIndex: 3, day: null })).toBe(true);
  });
});
