import { describe, expect, it } from 'vitest';
import { cardsInCell, moveCardInBoard } from './plot-board';
import type { PlotBoard } from './types';

const board = (): PlotBoard => ({
  id: 'b',
  name: 'Book',
  templateKey: 'blank',
  updatedAt: '',
  beats: [
    { id: 'b1', title: 'One', description: '' },
    { id: 'b2', title: 'Two', description: '' },
  ],
  threads: [
    { id: 't1', name: 'Main', color: '#000000' },
    { id: 't2', name: 'Side', color: '#111111' },
  ],
  cards: ['A', 'B', 'C'].map((title) => ({
    id: title,
    beatId: 'b1',
    threadId: 't1',
    title,
    text: '',
    sceneId: null,
    color: null,
  })),
});

const titles = (b: PlotBoard, beat: string, thread: string) =>
  cardsInCell(b, beat, thread).map((c) => c.title);

describe('moveCardInBoard', () => {
  it('reorders within a cell', () => {
    expect(
      titles(moveCardInBoard(board(), 'C', { beatId: 'b1', threadId: 't1', index: 0 }), 'b1', 't1'),
    ).toEqual(['C', 'A', 'B']);
    expect(
      titles(moveCardInBoard(board(), 'A', { beatId: 'b1', threadId: 't1', index: 1 }), 'b1', 't1'),
    ).toEqual(['B', 'A', 'C']);
  });

  it('treats an index past the end, or below zero, as the end or the start', () => {
    expect(
      titles(
        moveCardInBoard(board(), 'A', { beatId: 'b1', threadId: 't1', index: 99 }),
        'b1',
        't1',
      ),
    ).toEqual(['B', 'C', 'A']);
    expect(
      titles(
        moveCardInBoard(board(), 'C', { beatId: 'b1', threadId: 't1', index: -5 }),
        'b1',
        't1',
      ),
    ).toEqual(['C', 'A', 'B']);
  });

  it('moves a card to another cell and leaves the old one in order', () => {
    const moved = moveCardInBoard(board(), 'B', { beatId: 'b2', threadId: 't2', index: 0 });
    expect(titles(moved, 'b1', 't1')).toEqual(['A', 'C']);
    expect(titles(moved, 'b2', 't2')).toEqual(['B']);
    expect(moved.cards).toHaveLength(3);
  });

  it('puts a card among those already in the target cell', () => {
    let b = moveCardInBoard(board(), 'A', { beatId: 'b2', threadId: 't1', index: 0 });
    b = moveCardInBoard(b, 'B', { beatId: 'b2', threadId: 't1', index: 0 });
    b = moveCardInBoard(b, 'C', { beatId: 'b2', threadId: 't1', index: 1 });
    expect(titles(b, 'b2', 't1')).toEqual(['B', 'C', 'A']);
    expect(titles(b, 'b1', 't1')).toEqual([]);
  });

  it('does not change the original board, and ignores an unknown card', () => {
    const original = board();
    const copy = JSON.stringify(original);
    moveCardInBoard(original, 'A', { beatId: 'b2', threadId: 't2', index: 0 });
    expect(JSON.stringify(original)).toBe(copy);
    expect(moveCardInBoard(original, 'nope', { beatId: 'b2', threadId: 't2', index: 0 })).toBe(
      original,
    );
  });
});
