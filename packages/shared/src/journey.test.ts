import { describe, expect, it } from 'vitest';
import { journeyProgress, reconcilePointDays } from './journey';
import type { MapPoint } from './schemas/atlas';

const line: MapPoint[] = [
  [0, 0],
  [0.2, 0],
  [0.2, 0.2],
  [0.6, 0.2],
];

describe('journeyProgress', () => {
  it('has not started before the first dated stop, and shows the whole line ahead', () => {
    const p = journeyProgress(line, [10, null, null, 50], 5);
    expect(p).toMatchObject({ started: false, finished: false, position: null, travelled: [] });
    expect(p.ahead).toEqual(line);
  });

  it('puts the traveller part of the way along the line between dated stops', () => {
    // 20 of the 60 days passed; the line is 0.8 long, so a third of it is 0.2667 along.
    const p = journeyProgress(line, [10, null, null, 70], 30);
    expect(p.started).toBe(true);
    expect(p.finished).toBe(false);
    expect(p.position![0]).toBeCloseTo(0.2, 5);
    expect(p.position![1]).toBeCloseTo(0.0667, 3);
    expect(p.travelled[0]).toEqual([0, 0]);
    expect(p.travelled.at(-1)).toEqual(p.position);
    expect(p.ahead[0]).toEqual(p.position);
    expect(p.ahead.at(-1)).toEqual([0.6, 0.2]);
  });

  it('stops at a dated stop, and is finished at the end of the line', () => {
    const mid = journeyProgress(line, [10, null, 40, null], 60);
    expect(mid).toMatchObject({ started: true, finished: false, position: [0.2, 0.2] });
    expect(mid.ahead).toEqual([line[2], line[3]]);
    const end = journeyProgress(line, [10, null, null, 50], 99);
    expect(end).toMatchObject({ finished: true, position: [0.6, 0.2] });
    expect(end.travelled).toEqual(line);
  });

  it('is never started when no stop has a date', () => {
    expect(journeyProgress(line, null, 100).started).toBe(false);
    expect(journeyProgress(line, [null, null, null, null], 100).started).toBe(false);
  });

  it('handles two stops dated the same day', () => {
    const p = journeyProgress(line, [10, 10, null, 20], 10);
    expect(p.started).toBe(true);
    expect(p.position).toEqual([0.2, 0]);
  });
});

describe('reconcilePointDays', () => {
  const days = [1, 2, 3, 4];
  it('keeps the days when stops are only moved', () => {
    expect(
      reconcilePointDays(
        line,
        days,
        line.map(([x, y]) => [x + 0.01, y]),
      ),
    ).toEqual(days);
  });
  it('inserts an empty day for a stop added in the middle', () => {
    const next: MapPoint[] = [line[0]!, line[1]!, [0.3, 0.1], line[2]!, line[3]!];
    expect(reconcilePointDays(line, days, next)).toEqual([1, 2, null, 3, 4]);
  });
  it('drops the day of a stop that was removed', () => {
    const next: MapPoint[] = [line[0]!, line[2]!, line[3]!];
    expect(reconcilePointDays(line, days, next)).toEqual([1, 3, 4]);
  });
  it('handles a stop added or removed at the end, and starts over after bigger changes', () => {
    expect(reconcilePointDays(line, days, [...line, [0.9, 0.9]])).toEqual([1, 2, 3, 4, null]);
    expect(reconcilePointDays(line, days, line.slice(0, 3))).toEqual([1, 2, 3]);
    expect(reconcilePointDays(line, days, line.slice(0, 2))).toEqual([null, null]);
    expect(reconcilePointDays(line, null, [...line, [0.9, 0.9]])).toEqual([
      null,
      null,
      null,
      null,
      null,
    ]);
  });
});
