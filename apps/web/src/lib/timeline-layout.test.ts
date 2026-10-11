import { describe, expect, it } from 'vitest';
import { dateToDay, dayToDate, GREGORIAN_CALENDAR as G } from '@atlas/shared';
import { buildTicks, fitView, MIN_ITEM_WIDTH, packRows } from './timeline-layout';

const item = (id: string, from: number, to = from, labelWidth = 0) => ({
  id,
  from,
  to,
  labelWidth,
});

describe('packRows', () => {
  it('keeps items that do not touch in one row', () => {
    const { rowOf, rowCount } = packRows([item('a', 0, 10), item('b', 100, 110)], 1);
    expect(rowCount).toBe(1);
    expect([rowOf.get('a'), rowOf.get('b')]).toEqual([0, 0]);
  });

  it('moves overlapping items to another row', () => {
    const { rowOf, rowCount } = packRows(
      [item('a', 0, 100), item('b', 50, 150), item('c', 120, 130)],
      1,
    );
    expect(rowCount).toBe(2);
    expect(rowOf.get('a')).toBe(0);
    expect(rowOf.get('b')).toBe(1);
    expect(rowOf.get('c')).toBe(0); // a has ended by the time c starts
  });

  it("reserves room for each item's label, so labels never run into the next item", () => {
    // Two single moments 20 days apart at 1px a day: the first's 80px label covers the second.
    const crowded = packRows([item('a', 0, 0, 80), item('b', 20, 20, 80)], 1);
    expect(crowded.rowCount).toBe(2);
    // Zoomed in far enough that there is room, they share a row.
    const roomy = packRows([item('a', 0, 0, 80), item('b', 20, 20, 80)], 10);
    expect(roomy.rowCount).toBe(1);
  });

  it('gives a single moment a visible width', () => {
    const { rowCount } = packRows([item('a', 0), item('b', 0)], 0.001);
    expect(rowCount).toBe(2); // same instant, and each at least MIN_ITEM_WIDTH wide
    expect(MIN_ITEM_WIDTH).toBeGreaterThan(0);
  });

  it('never overlaps two items in a row, for any input order', () => {
    const inputs = Array.from({ length: 200 }, (_, i) =>
      item(`i${i}`, (i * 37) % 500, ((i * 37) % 500) + (i % 7) * 15, 30 + (i % 5) * 10),
    );
    const ppd = 2;
    const { rowOf } = packRows([...inputs].reverse(), ppd);
    const byRow = new Map<number, typeof inputs>();
    for (const input of inputs)
      byRow.set(rowOf.get(input.id)!, [...(byRow.get(rowOf.get(input.id)!) ?? []), input]);
    for (const rowItems of byRow.values()) {
      rowItems.sort((a, b) => a.from - b.from);
      for (let i = 1; i < rowItems.length; i++) {
        const before = rowItems[i - 1]!;
        const right = Math.max(
          before.to * ppd,
          before.from * ppd + 10,
          before.from * ppd + before.labelWidth,
        );
        expect(
          rowItems[i]!.from * ppd,
          `${before.id} -> ${rowItems[i]!.id}`,
        ).toBeGreaterThanOrEqual(right);
      }
    }
  });

  it('handles nothing at all', () => {
    expect(packRows([], 1)).toEqual({ rowOf: new Map(), rowCount: 0 });
  });
});

describe('buildTicks', () => {
  const day = (year: number, month = 1, d = 1) => dateToDay(G, { year, month: month - 1, day: d });

  it('marks years at a nice interval that keeps labels apart', () => {
    // About 1,000 years across 960px: roughly one pixel per year, so every 100 years.
    const ticks = buildTicks(G, day(1000), day(2000), 960 / (1000 * 365.2425));
    const years = ticks.filter((t) => t.major).map((t) => dayToDate(G, t.day).year);
    expect(years.slice(0, 3)).toEqual([1000, 1100, 1200]);
    expect(years.every((y) => y % 100 === 0)).toBe(true);
    expect(ticks.filter((t) => !t.major)).toEqual([]); // no month marks this far out
  });

  it('marks every year, then months, as you zoom in', () => {
    // 100px per year is room enough to label every year, but not yet the months.
    const wide = buildTicks(G, day(2000), day(2010), 1000 / (10 * 365.2425));
    const wideYears = wide.filter((t) => t.major).map((t) => dayToDate(G, t.day).year);
    expect(wideYears.slice(0, 10)).toEqual([
      2000, 2001, 2002, 2003, 2004, 2005, 2006, 2007, 2008, 2009,
    ]);
    expect(wide.filter((t) => !t.major)).toEqual([]);
    // 25px per year only has room for every second or fifth year.
    const sparse = buildTicks(G, day(2000), day(2040), 1000 / (40 * 365.2425));
    const gaps = sparse
      .filter((t) => t.major)
      .map((t) => dayToDate(G, t.day).year)
      .map((year, i, all) => (i === 0 ? 0 : year - all[i - 1]!))
      .slice(1);
    expect(new Set(gaps).size).toBe(1);
    expect(gaps[0]).toBeGreaterThanOrEqual(5);
    // A year across 1000px makes months about 80px wide: room for their names.
    const close = buildTicks(G, day(2021), day(2022), 1000 / 365.2425);
    expect(close.some((t) => !t.major && t.label === 'March')).toBe(true);
    expect(close.filter((t) => t.major).map((t) => t.label)).toContain('2021 CE');
  });

  it("labels years with the calendar's eras", () => {
    const ticks = buildTicks(G, day(500), day(560), 1000 / (60 * 365.2425));
    expect(ticks.find((t) => t.major)?.label).toMatch(/CE$/);
  });

  it('copes with negative years and an empty or backwards range', () => {
    const ticks = buildTicks(G, day(-500), day(-400), 960 / (100 * 365.2425));
    expect(ticks.length).toBeGreaterThan(0);
    expect(buildTicks(G, 10, 10, 1)).toEqual([]);
    expect(buildTicks(G, 20, 10, 1)).toEqual([]);
    expect(buildTicks(G, 0, 100, 0)).toEqual([]);
  });

  it('keeps the number of marks bounded however far out you zoom', () => {
    expect(buildTicks(G, -10_000_000, 10_000_000, 1e-6).length).toBeLessThan(600);
  });
});

describe('fitView', () => {
  it('frames the range with room at each end', () => {
    const view = fitView(1000, 2000, 900);
    expect(view.startDay).toBeLessThan(1000);
    expect(view.startDay + 900 / view.pxPerDay).toBeGreaterThan(2000);
  });

  it('does not zoom absurdly far in on a single day', () => {
    const view = fitView(500, 500, 900);
    expect(view.pxPerDay).toBeLessThan(900 / 30);
    expect(Number.isFinite(view.pxPerDay)).toBe(true);
  });
});
