import { describe, expect, it } from 'vitest';
import {
  boardBounds,
  boardForPlayers,
  itemsInFrame,
  masonryLayout,
  paletteFromPixels,
} from './boards';
import { boardDocSchema, boardUpdateSchema, type BoardDoc } from './schemas/boards';

const E1 = '11111111-1111-4111-8111-111111111111';
const E2 = '22222222-2222-4222-8222-222222222222';
const I1 = '33333333-3333-4333-8333-333333333333';

const box = { x: 0, y: 0, w: 100, h: 100 };
const doc = (): BoardDoc =>
  boardDocSchema.parse({
    items: [
      { ...box, id: 'a', type: 'entry', entityId: E1 },
      { ...box, id: 'b', type: 'entry', entityId: E2 },
      { ...box, id: 'c', type: 'note', text: 'The duke lies', gmOnly: true },
      { ...box, id: 'd', type: 'image', imageId: I1 },
      { ...box, id: 'e', type: 'note', text: 'Open question' },
    ],
    links: [
      { id: 'l1', from: 'a', to: 'b' },
      { id: 'l2', from: 'a', to: 'e', label: 'asks' },
      { id: 'l3', from: 'c', to: 'e' },
    ],
  });

describe('board documents', () => {
  it('fills in defaults', () => {
    const parsed = doc();
    expect(parsed.items[2]).toMatchObject({ color: 'vellum', size: 'sm', gmOnly: true });
    expect(parsed.items[0]!.gmOnly).toBe(false);
    expect(parsed.links[0]!.label).toBe('');
  });

  it('rejects repeated IDs and arrows that point nowhere', () => {
    const item = { ...box, id: 'a', type: 'note' };
    expect(boardDocSchema.safeParse({ items: [item, item] }).success).toBe(false);
    expect(
      boardDocSchema.safeParse({ items: [item], links: [{ id: 'l', from: 'a', to: 'zz' }] })
        .success,
    ).toBe(false);
    expect(
      boardDocSchema.safeParse({ items: [item], links: [{ id: 'l', from: 'a', to: 'a' }] }).success,
    ).toBe(false);
  });

  it('needs the base version when the document is saved', () => {
    expect(boardUpdateSchema.safeParse({ doc: { items: [] } }).success).toBe(false);
    expect(boardUpdateSchema.safeParse({ doc: { items: [] }, baseVersion: 3 }).success).toBe(true);
    expect(boardUpdateSchema.safeParse({ name: 'Renamed' }).success).toBe(true);
  });
});

describe('boardForPlayers', () => {
  it('drops GM-only items, unseen entries and pictures, and arrows left dangling', () => {
    const seen = boardForPlayers(doc(), new Set([E1]), new Set());
    expect(seen.items.map((item) => item.id)).toEqual(['a', 'e']);
    expect(seen.links.map((link) => link.id)).toEqual(['l2']);
  });

  it('keeps everything a player may see', () => {
    const seen = boardForPlayers(doc(), new Set([E1, E2]), new Set([I1]));
    expect(seen.items.map((item) => item.id)).toEqual(['a', 'b', 'd', 'e']);
    expect(seen.links.map((link) => link.id)).toEqual(['l1', 'l2']);
  });
});

describe('itemsInFrame', () => {
  it('takes items whose centre is inside, and only smaller frames', () => {
    const { items } = boardDocSchema.parse({
      items: [
        { id: 'frame', type: 'frame', x: 0, y: 0, w: 400, h: 300 },
        { id: 'in', type: 'note', x: 50, y: 50, w: 100, h: 100 },
        { id: 'edge', type: 'note', x: 360, y: 100, w: 100, h: 100 },
        { id: 'half', type: 'note', x: 320, y: 100, w: 100, h: 100 },
        { id: 'small', type: 'frame', x: 100, y: 100, w: 100, h: 100 },
        { id: 'big', type: 'frame', x: -100, y: -100, w: 600, h: 500 },
      ],
    });
    expect(itemsInFrame(items[0]!, items)).toEqual(['in', 'half', 'small']);
  });
});

describe('boardBounds', () => {
  it('wraps the items, or is null with none', () => {
    expect(boardBounds([])).toBeNull();
    expect(
      boardBounds([
        { x: -10, y: 5, w: 20, h: 20 },
        { x: 50, y: -5, w: 10, h: 100 },
      ]),
    ).toEqual({ x: -10, y: -5, w: 70, h: 100 });
  });
});

describe('masonryLayout', () => {
  it('keeps shapes and fills the shortest column', () => {
    const placed = masonryLayout(
      [
        { id: 'tall', x: 0, y: 0, w: 100, h: 300 },
        { id: 'wide', x: 0, y: 0, w: 400, h: 200 },
        { id: 'square', x: 0, y: 0, w: 50, h: 50 },
      ],
      { columns: 2, columnWidth: 200, gap: 10, x: 1000, y: 500 },
    );
    expect(placed).toEqual([
      { id: 'tall', x: 1000, y: 500, w: 200, h: 600 },
      { id: 'wide', x: 1210, y: 500, w: 200, h: 100 },
      { id: 'square', x: 1210, y: 610, w: 200, h: 200 },
    ]);
  });
});

describe('paletteFromPixels', () => {
  const pixels = (...groups: [number, [number, number, number, number]][]) =>
    groups.flatMap(([n, colour]) => Array.from({ length: n }, () => colour).flat());

  it('finds the main colours, most used first, and skips see-through pixels', () => {
    const palette = paletteFromPixels(
      pixels([60, [200, 30, 30, 255]], [30, [20, 40, 220, 255]], [500, [0, 255, 0, 0]]),
      2,
    );
    expect(palette).toEqual(['#c81e1e', '#1428dc']);
  });

  it('gives fewer colours when the picture has fewer, and none for nothing', () => {
    expect(paletteFromPixels(pixels([10, [10, 10, 10, 255]]), 5)).toEqual(['#0a0a0a']);
    expect(paletteFromPixels([], 5)).toEqual([]);
  });
});
