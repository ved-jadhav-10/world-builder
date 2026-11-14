import { describe, expect, it } from 'vitest';
import { buildSceneIndex } from './progressions';
import type { ManuscriptNode } from './types';
import {
  chapterLabel,
  isRevealedToReader,
  READER_END,
  READER_START,
  readerPoint,
  wikiChapters,
  wikiProgressSchema,
} from './wiki';

let order = 0;
function node(
  id: string,
  kind: ManuscriptNode['kind'],
  parentId: string | null,
  inWorldDay: number | null = null,
): ManuscriptNode {
  return {
    id,
    kind,
    parentId,
    title: id,
    summary: '',
    sortOrder: order++,
    wordCount: 0,
    povId: null,
    locationId: null,
    inWorldDate: '',
    inWorldDay,
    updatedAt: '2026-01-01T00:00:00.000Z',
  };
}

// Book 1: a part with two chapters (2 scenes, then 1), then an empty chapter, then book 2.
const nodes: ManuscriptNode[] = [
  node('book1', 'book', null),
  node('part1', 'part', 'book1'),
  node('ch1', 'chapter', 'part1'),
  node('s1', 'scene', 'ch1', 10),
  node('s2', 'scene', 'ch1', 12),
  node('ch2', 'chapter', 'part1'),
  node('s3', 'scene', 'ch2'),
  node('ch3', 'chapter', 'book1'),
  node('book2', 'book', null),
  node('ch4', 'chapter', 'book2'),
  node('s4', 'scene', 'ch4', 40),
];
const scenes = buildSceneIndex(nodes);
const chapters = wikiChapters(nodes);

describe('the reader wiki rules', () => {
  it('numbers chapters across parts and books, with the scenes each covers', () => {
    expect(chapters.map((c) => [c.id, c.number, c.firstScene, c.lastScene])).toEqual([
      ['ch1', 1, 0, 1],
      ['ch2', 2, 2, 2],
      ['ch3', 3, null, null],
      ['ch4', 4, 3, 3],
    ]);
  });

  it('places a reader at the end of the chapter they name', () => {
    expect(readerPoint(READER_START, chapters, scenes)).toEqual({
      chapterIndex: -1,
      sceneIndex: -1,
      day: null,
    });
    expect(readerPoint('ch1', chapters, scenes)).toEqual({
      chapterIndex: 0,
      sceneIndex: 1,
      day: 12,
    });
    // An undated chapter keeps the latest day read so far.
    expect(readerPoint('ch2', chapters, scenes)).toEqual({
      chapterIndex: 1,
      sceneIndex: 2,
      day: 12,
    });
    // An empty chapter moves the chapter on, not the scenes.
    expect(readerPoint('ch3', chapters, scenes)).toEqual({
      chapterIndex: 2,
      sceneIndex: 2,
      day: 12,
    });
    expect(readerPoint(READER_END, chapters, scenes)).toBeNull();
    expect(readerPoint('gone', chapters, scenes)).toEqual({
      chapterIndex: -1,
      sceneIndex: -1,
      day: null,
    });
  });

  it('reveals an entry once its chapter or scene has been read', () => {
    const at = (progress: string) => readerPoint(progress, chapters, scenes);
    const shown = (gate: string | null, progress: string) =>
      isRevealedToReader(gate, at(progress), chapters, scenes);
    expect(shown(null, READER_START)).toBe(true);
    expect(shown('ch2', READER_START)).toBe(false);
    expect(shown('ch2', 'ch1')).toBe(false);
    expect(shown('ch2', 'ch2')).toBe(true);
    expect(shown('ch2', 'ch4')).toBe(true);
    // A scene gate: the second scene of chapter 1 is read by the end of chapter 1.
    expect(shown('s2', READER_START)).toBe(false);
    expect(shown('s2', 'ch1')).toBe(true);
    // An empty chapter can still be a gate.
    expect(shown('ch3', 'ch2')).toBe(false);
    expect(shown('ch3', 'ch3')).toBe(true);
    // A gate that no longer exists hides the entry until the end.
    expect(shown('gone', 'ch4')).toBe(false);
    expect(shown('gone', READER_END)).toBe(true);
  });

  it('labels chapters by number, adding the title only when asked and worth it', () => {
    const chapter = { id: 'x', number: 7, title: 'The Drowned King', firstScene: 0, lastScene: 0 };
    expect(chapterLabel(chapter, false)).toBe('Chapter 7');
    expect(chapterLabel(chapter, true)).toBe('Chapter 7: The Drowned King');
    expect(chapterLabel({ ...chapter, title: 'Chapter 7' }, true)).toBe('Chapter 7');
    expect(chapterLabel({ ...chapter, title: '  ' }, true)).toBe('Chapter 7');
  });

  it('accepts only the start, the end or a chapter id as progress', () => {
    expect(wikiProgressSchema.parse(undefined)).toBe(READER_START);
    expect(wikiProgressSchema.parse('end')).toBe(READER_END);
    expect(wikiProgressSchema.safeParse('chapter-7').success).toBe(false);
    expect(wikiProgressSchema.safeParse('11111111-1111-4111-8111-111111111111').success).toBe(true);
  });
});
