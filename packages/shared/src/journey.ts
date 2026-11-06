import type { MapPoint } from './schemas/atlas';

/*
 * Journey lines: a route with dated stops. Given a day, where along it is the traveller, and
 * which part of the route is already behind them?
 */

/** The day at each stop (null for a stop with no date), one per point of the line. */
export type PointDays = (number | null)[];

export interface JourneyProgress {
  /** Before the first dated stop, the journey has not begun. */
  started: boolean;
  /** At or past the last dated stop. */
  finished: boolean;
  /** Where the traveller is; null before the journey starts. */
  position: MapPoint | null;
  /** The line from the start up to the traveller. */
  travelled: MapPoint[];
  /** The rest of the line, from the traveller on. */
  ahead: MapPoint[];
}

const length = (a: MapPoint, b: MapPoint) => Math.hypot(b[0] - a[0], b[1] - a[1]);

/** The point `fraction` (0 to 1) of the way along the line through `points`, with the pieces. */
function along(points: MapPoint[], fraction: number) {
  const total = points.slice(1).reduce((sum, p, i) => sum + length(points[i]!, p), 0);
  if (total === 0) return { at: points[0]!, before: [points[0]!], after: [points[0]!] };
  let remaining = fraction * total;
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1]!;
    const b = points[i]!;
    const segment = length(a, b);
    if (remaining <= segment || i === points.length - 1) {
      const t = segment === 0 ? 0 : Math.min(1, remaining / segment);
      const at: MapPoint = [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
      return { at, before: [...points.slice(0, i), at], after: [at, ...points.slice(i)] };
    }
    remaining -= segment;
  }
  const last = points.at(-1)!;
  return { at: last, before: points, after: [last] };
}

/** Where a journey stands on `day`. Undated stops are passed on the way between dated ones. */
export function journeyProgress(
  points: MapPoint[],
  days: PointDays | null,
  day: number,
): JourneyProgress {
  const dated = points
    .map((_, index) => ({ index, day: days?.[index] ?? null }))
    .filter((stop): stop is { index: number; day: number } => stop.day !== null)
    .sort((a, b) => a.index - b.index);
  const first = dated[0];
  const last = dated.at(-1);
  if (!first || !last || points.length < 2 || day < first.day) {
    return { started: false, finished: false, position: null, travelled: [], ahead: points };
  }
  if (day >= last.day) {
    const at = points[last.index]!;
    return {
      started: true,
      finished: last.index === points.length - 1,
      position: at,
      travelled: points.slice(0, last.index + 1),
      ahead: points.slice(last.index),
    };
  }
  // Between two dated stops: spread the time over the length of the line between them.
  const nextIndex = dated.findIndex((stop) => stop.day > day);
  const to = dated[nextIndex]!;
  const from = dated[nextIndex - 1]!;
  const leg = points.slice(from.index, to.index + 1);
  const span = to.day - from.day;
  const piece = along(leg, span === 0 ? 1 : (day - from.day) / span);
  return {
    started: true,
    finished: false,
    position: piece.at,
    travelled: [...points.slice(0, from.index), ...piece.before],
    ahead: [...piece.after, ...points.slice(to.index + 1)],
  };
}

/**
 * Keeps the days with their stops when a line is reshaped. A stop added or removed shifts the
 * ones after it; anything bigger than one change starts the days again.
 */
export function reconcilePointDays(
  oldPoints: readonly MapPoint[],
  oldDays: PointDays | null,
  newPoints: readonly MapPoint[],
): PointDays {
  const days: PointDays = oldDays ? [...oldDays] : oldPoints.map(() => null);
  while (days.length < oldPoints.length) days.push(null);
  const same = (a: MapPoint, b: MapPoint) => a[0] === b[0] && a[1] === b[1];
  if (newPoints.length === oldPoints.length) return days;
  if (Math.abs(newPoints.length - oldPoints.length) !== 1) return newPoints.map(() => null);

  const shorter = newPoints.length < oldPoints.length ? newPoints : oldPoints;
  const longer = shorter === newPoints ? oldPoints : newPoints;
  // The first place the two lines disagree is where a stop came or went.
  let at = 0;
  while (at < shorter.length && same(shorter[at]!, longer[at]!)) at++;
  if (newPoints.length > oldPoints.length) days.splice(at, 0, null);
  else days.splice(at, 1);
  return days;
}
