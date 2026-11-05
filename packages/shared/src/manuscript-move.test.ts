import { describe, expect, it } from 'vitest';
import { resolveDrop, type MovableNode } from './manuscript-move';

// Book > Part A > (Ch 1 > S1, S2), Ch 2 > S3; Part B (empty); Ch 3 straight under the book.
const nodes: MovableNode[] = [
  { id: 'book', parentId: null, kind: 'book' },
  { id: 'partA', parentId: 'book', kind: 'part' },
  { id: 'ch1', parentId: 'partA', kind: 'chapter' },
  { id: 's1', parentId: 'ch1', kind: 'scene' },
  { id: 's2', parentId: 'ch1', kind: 'scene' },
  { id: 'ch2', parentId: 'partA', kind: 'chapter' },
  { id: 's3', parentId: 'ch2', kind: 'scene' },
  { id: 'partB', parentId: 'book', kind: 'part' },
  { id: 'ch3', parentId: 'book', kind: 'chapter' },
  { id: 'book2', parentId: null, kind: 'book' },
];

describe('resolveDrop', () => {
  it('puts an item before or after a sibling', () => {
    expect(resolveDrop(nodes, 's2', 's1', 'before')).toEqual({ parentId: 'ch1', index: 0 });
    expect(resolveDrop(nodes, 's1', 's2', 'after')).toEqual({ parentId: 'ch1', index: 1 });
  });

  it('counts positions after the moved item has left its old place', () => {
    // Chapter 1 has S1, S2. Moving S1 after S2 leaves [S2] and puts S1 at index 1.
    expect(resolveDrop(nodes, 's1', 's2', 'after')?.index).toBe(1);
    // Moving S1 before S2 is where it already is.
    expect(resolveDrop(nodes, 's1', 's2', 'before')).toBeNull();
    expect(resolveDrop(nodes, 's2', 's1', 'after')).toBeNull();
  });

  it('moves an item to another parent, at the end when dropped inside', () => {
    expect(resolveDrop(nodes, 's1', 'ch2', 'inside')).toEqual({ parentId: 'ch2', index: 1 });
    expect(resolveDrop(nodes, 's3', 'ch1', 'inside')).toEqual({ parentId: 'ch1', index: 2 });
  });

  it('moves into an empty parent', () => {
    expect(resolveDrop(nodes, 'ch1', 'partB', 'inside')).toEqual({ parentId: 'partB', index: 0 });
  });

  it('places beside an item in another parent', () => {
    expect(resolveDrop(nodes, 's3', 's1', 'after')).toEqual({ parentId: 'ch1', index: 1 });
    expect(resolveDrop(nodes, 'ch1', 'ch3', 'before')).toEqual({ parentId: 'book', index: 2 });
  });

  it('keeps to the nesting rules', () => {
    // A scene cannot sit among chapters or directly in a part, nor a part inside a chapter.
    expect(resolveDrop(nodes, 's1', 'ch3', 'before')).toBeNull();
    expect(resolveDrop(nodes, 's1', 'partA', 'inside')).toBeNull();
    expect(resolveDrop(nodes, 'partA', 'ch1', 'inside')).toBeNull();
    expect(resolveDrop(nodes, 'ch1', 'book', 'before')).toBeNull();
    // Nothing is inside a scene.
    expect(resolveDrop(nodes, 's1', 's2', 'inside')).toBeNull();
  });

  it('lets a chapter sit directly in a book or in a part', () => {
    expect(resolveDrop(nodes, 'ch1', 'book', 'inside')).toEqual({ parentId: 'book', index: 3 });
    expect(resolveDrop(nodes, 'ch3', 'partA', 'inside')).toEqual({ parentId: 'partA', index: 2 });
  });

  it('orders books at the top level', () => {
    expect(resolveDrop(nodes, 'book2', 'book', 'before')).toEqual({ parentId: null, index: 0 });
    expect(resolveDrop(nodes, 'book', 'book2', 'after')).toEqual({ parentId: null, index: 1 });
    expect(resolveDrop(nodes, 'book', 'book2', 'before')).toBeNull();
    // A book cannot be dropped into another.
    expect(resolveDrop(nodes, 'book2', 'book', 'inside')).toBeNull();
  });

  it('never puts an item inside itself or onto itself', () => {
    expect(resolveDrop(nodes, 'partA', 'partA', 'after')).toBeNull();
    expect(resolveDrop(nodes, 'partA', 'ch1', 'before')).toBeNull();
    expect(resolveDrop(nodes, 'ch1', 's1', 'before')).toBeNull();
  });

  it('answers null for ids that are not there', () => {
    expect(resolveDrop(nodes, 'nope', 's1', 'before')).toBeNull();
    expect(resolveDrop(nodes, 's1', 'nope', 'before')).toBeNull();
  });
});
