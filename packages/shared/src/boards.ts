import type { BoardDoc, BoardItem, BoardKind } from './schemas/boards';
import type { Visibility } from './schemas/common';

/** A board in a list. */
export interface BoardSummary {
  id: string;
  name: string;
  kind: BoardKind;
  shared: boolean;
  itemCount: number;
  /** Up to four gallery pictures on the board, for a preview. */
  previewImageIds: string[];
  createdAt: string;
  updatedAt: string;
}

/** What a card needs to show an entry. */
export interface BoardEntry {
  id: string;
  name: string;
  typeId: string;
  summary: string;
  portraitId: string | null;
  /** Who may see the entry, so the GM can tell which cards a shared board leaves out. */
  visibility: Visibility;
}

export interface BoardImage {
  id: string;
  width: number;
  height: number;
  caption: string;
  visibility: Visibility;
}

/** A board with everything needed to draw it. Entries and pictures the viewer may not see are absent. */
export interface Board extends Omit<BoardSummary, 'itemCount' | 'previewImageIds'> {
  version: number;
  doc: BoardDoc;
  entries: Record<string, BoardEntry>;
  images: Record<string, BoardImage>;
}

interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

/**
 * The board as a player may see it: nothing marked GM-only, no card for an entry or picture they
 * cannot see, and no arrow left pointing at something that was taken out. A frame's title is kept:
 * frames are layout, and the GM can mark one GM-only.
 */
export function boardForPlayers(
  doc: BoardDoc,
  visibleEntryIds: ReadonlySet<string>,
  visibleImageIds: ReadonlySet<string>,
): BoardDoc {
  const items = doc.items.filter((item) => {
    if (item.gmOnly) return false;
    if (item.type === 'entry') return visibleEntryIds.has(item.entityId);
    if (item.type === 'image') return visibleImageIds.has(item.imageId);
    return true;
  });
  const kept = new Set(items.map((item) => item.id));
  return { items, links: doc.links.filter((link) => kept.has(link.from) && kept.has(link.to)) };
}

/** The items whose centre lies inside a frame (the frame itself and other frames around it excluded). */
export function itemsInFrame(frame: Box & { id: string }, items: readonly BoardItem[]): string[] {
  return items
    .filter((item) => {
      if (item.id === frame.id) return false;
      const cx = item.x + item.w / 2;
      const cy = item.y + item.h / 2;
      const inside =
        cx >= frame.x && cx <= frame.x + frame.w && cy >= frame.y && cy <= frame.y + frame.h;
      // A frame only carries a smaller frame, never one that contains it.
      return inside && !(item.type === 'frame' && item.w * item.h >= frame.w * frame.h);
    })
    .map((item) => item.id);
}

/** The smallest box around the given items, or null when there are none. */
export function boardBounds(items: readonly Box[]): Box | null {
  if (items.length === 0) return null;
  let left = Infinity;
  let top = Infinity;
  let right = -Infinity;
  let bottom = -Infinity;
  for (const item of items) {
    left = Math.min(left, item.x);
    top = Math.min(top, item.y);
    right = Math.max(right, item.x + item.w);
    bottom = Math.max(bottom, item.y + item.h);
  }
  return { x: left, y: top, w: right - left, h: bottom - top };
}

export interface MasonryOptions {
  columns: number;
  columnWidth: number;
  gap: number;
  x: number;
  y: number;
}

/**
 * Lays boxes out as a wall of equal-width columns, each box keeping its shape and going to
 * whichever column is shortest so far. Returns the new place and size of each, in the order given.
 */
export function masonryLayout<T extends Box & { id: string }>(
  items: readonly T[],
  { columns, columnWidth, gap, x, y }: MasonryOptions,
): (Box & { id: string })[] {
  const count = Math.max(1, Math.floor(columns));
  const heights = Array.from({ length: count }, () => 0);
  return items.map((item) => {
    let column = 0;
    for (let i = 1; i < count; i++) if (heights[i]! < heights[column]! - 0.5) column = i;
    const h = Math.round((item.h / Math.max(1, item.w)) * columnWidth);
    const placed = {
      id: item.id,
      x: x + column * (columnWidth + gap),
      y: y + heights[column]!,
      w: columnWidth,
      h,
    };
    heights[column] = heights[column]! + h + gap;
    return placed;
  });
}

const hex = (r: number, g: number, b: number) =>
  `#${[r, g, b].map((v) => Math.round(v).toString(16).padStart(2, '0')).join('')}`;

/**
 * The main colours of a picture, from its RGBA pixels: the pixels are split again and again across
 * the widest colour channel, and each group gives its average. Most-used first.
 */
export function paletteFromPixels(rgba: ArrayLike<number>, count = 5): string[] {
  let pixels: [number, number, number][] = [];
  for (let i = 0; i + 3 < rgba.length; i += 4) {
    if (rgba[i + 3]! < 128) continue;
    pixels.push([rgba[i]!, rgba[i + 1]!, rgba[i + 2]!]);
  }
  if (pixels.length === 0) return [];
  // Plenty for a palette, and keeps a large picture quick.
  if (pixels.length > 20_000) {
    const step = Math.ceil(pixels.length / 20_000);
    pixels = pixels.filter((_, i) => i % step === 0);
  }

  const range = (group: [number, number, number][], channel: 0 | 1 | 2) => {
    let low = 255;
    let high = 0;
    for (const p of group) {
      low = Math.min(low, p[channel]);
      high = Math.max(high, p[channel]);
    }
    return high - low;
  };
  const widest = (group: [number, number, number][]) => {
    const ranges = [range(group, 0), range(group, 1), range(group, 2)] as const;
    const channel = ranges.indexOf(Math.max(...ranges)) as 0 | 1 | 2;
    return { channel, spread: ranges[channel] };
  };

  let groups = [pixels];
  while (groups.length < count) {
    // Split the group whose colours vary most (weighted a little by how many pixels it has).
    let pick = -1;
    let best = 0;
    groups.forEach((group, i) => {
      const score = widest(group).spread * Math.log2(group.length + 1);
      if (group.length > 1 && score > best) {
        best = score;
        pick = i;
      }
    });
    if (pick < 0) break;
    const group = groups[pick]!;
    const { channel } = widest(group);
    let low = 255;
    let high = 0;
    for (const p of group) {
      low = Math.min(low, p[channel]);
      high = Math.max(high, p[channel]);
    }
    // Cut at the middle of the range, not the middle pixel, so two flat colours part cleanly.
    const middle = (low + high) / 2;
    groups = [
      ...groups.slice(0, pick),
      group.filter((p) => p[channel] <= middle),
      group.filter((p) => p[channel] > middle),
      ...groups.slice(pick + 1),
    ];
  }

  const colours = groups
    .filter((group) => group.length > 0)
    .sort((a, b) => b.length - a.length)
    .map((group) => {
      const sum = [0, 0, 0];
      for (const p of group) {
        sum[0]! += p[0];
        sum[1]! += p[1];
        sum[2]! += p[2];
      }
      return hex(sum[0]! / group.length, sum[1]! / group.length, sum[2]! / group.length);
    });
  return [...new Set(colours)];
}
