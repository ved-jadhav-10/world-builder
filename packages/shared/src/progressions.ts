import type { ManuscriptNode, Progression } from './types';

/*
 * "As of" views. A progression is anchored to a scene (a place in reading order) or to an
 * in-world day. The viewer picks a point in the story the same way, and these rules decide which
 * progressions have happened by then:
 *
 *  - Same kind of anchor: compare directly (scene order against scene order, day against day).
 *  - A scene's day, when it has one, lets scenes and days be compared with each other.
 *  - Anything that can't be placed (a deleted scene, or a scene with no date being compared with
 *    a day) is reported as "unplaced" rather than guessed at.
 */

export interface SceneInfo {
  id: string;
  title: string;
  /** Position in reading order, from 0. */
  index: number;
  /** The scene's in-world day, if it has one. */
  day: number | null;
}
export type SceneIndex = Map<string, SceneInfo>;

/** Scenes in reading order: depth first through book, part and chapter, by sort order. */
export function buildSceneIndex(nodes: readonly ManuscriptNode[]): SceneIndex {
  const children = new Map<string | null, ManuscriptNode[]>();
  for (const node of nodes) {
    children.set(node.parentId, [...(children.get(node.parentId) ?? []), node]);
  }
  for (const list of children.values()) list.sort((a, b) => a.sortOrder - b.sortOrder);

  const scenes: SceneIndex = new Map();
  const visit = (parentId: string | null) => {
    for (const node of children.get(parentId) ?? []) {
      if (node.kind === 'scene') {
        scenes.set(node.id, {
          id: node.id,
          title: node.title,
          index: scenes.size,
          day: node.inWorldDay,
        });
      } else {
        visit(node.id);
      }
    }
  };
  visit(null);
  return scenes;
}

/** Where the viewer is in the story. A scene gives both; a bare date gives only the day. */
export interface StoryPoint {
  sceneIndex: number | null;
  day: number | null;
}

export function pointAtScene(scenes: SceneIndex, sceneId: string): StoryPoint | null {
  const scene = scenes.get(sceneId);
  return scene ? { sceneIndex: scene.index, day: scene.day } : null;
}

export const pointAtDay = (day: number): StoryPoint => ({ sceneIndex: null, day });

/** Anything placed in the story: a progression, or a picture tagged to a scene or a date. */
export interface Anchored {
  sceneId: string | null;
  day: number | null;
  createdAt: string;
}

export type Placement = 'applied' | 'later' | 'unplaced';

/** Has this progression happened by `point`, will it later, or can that not be told? */
export function placeProgression(
  progression: Pick<Anchored, 'sceneId' | 'day'>,
  point: StoryPoint,
  scenes: SceneIndex,
): Placement {
  const verdict = (reached: boolean): Placement => (reached ? 'applied' : 'later');
  if (progression.sceneId) {
    const scene = scenes.get(progression.sceneId);
    if (!scene) return 'unplaced';
    if (point.sceneIndex !== null) return verdict(scene.index <= point.sceneIndex);
    if (point.day !== null && scene.day !== null) return verdict(scene.day <= point.day);
    return 'unplaced';
  }
  if (progression.day !== null) {
    return point.day !== null ? verdict(progression.day <= point.day) : 'unplaced';
  }
  return 'unplaced';
}

/**
 * The order progressions take effect in, so later ones win. Reading a scene, scenes go by
 * reading order; reading a date, everything goes by in-world day. A scene and a date are
 * compared by the scene's day. Ties fall back to when they were written.
 */
function compareProgressions(
  a: Anchored,
  b: Anchored,
  scenes: SceneIndex,
  byReadingOrder: boolean,
): number {
  const sceneA = a.sceneId ? scenes.get(a.sceneId) : undefined;
  const sceneB = b.sceneId ? scenes.get(b.sceneId) : undefined;
  if (byReadingOrder && sceneA && sceneB && sceneA.index !== sceneB.index) {
    return sceneA.index - sceneB.index;
  }
  const dayA = a.day ?? sceneA?.day ?? null;
  const dayB = b.day ?? sceneB?.day ?? null;
  if (dayA !== null && dayB !== null && dayA !== dayB) return dayA - dayB;
  if (sceneA && sceneB && sceneA.index !== sceneB.index) return sceneA.index - sceneB.index;
  return a.createdAt.localeCompare(b.createdAt);
}

/** Progressions in the order they take effect. Reading order suits a writer following scenes. */
export function sortProgressions<T extends Anchored>(
  list: readonly T[],
  scenes: SceneIndex,
  byReadingOrder: boolean,
): T[] {
  return [...list].sort((a, b) => compareProgressions(a, b, scenes, byReadingOrder));
}

/**
 * Of things anchored in the story (say, an entry's pictures), the one that most recently took
 * effect by `point`: the picture showing how someone looked at that moment. Null if none has yet.
 */
export function latestApplicable<T extends Anchored>(
  items: readonly T[],
  point: StoryPoint,
  scenes: SceneIndex,
): T | null {
  const reached = items.filter((item) => placeProgression(item, point, scenes) === 'applied');
  return sortProgressions(reached, scenes, point.sceneIndex !== null).at(-1) ?? null;
}

export interface ResolvedEntry {
  fields: Record<string, unknown>;
  summary: string;
  /** In the order they took effect. */
  applied: Progression[];
  later: Progression[];
  unplaced: Progression[];
}

/** An entry's fields and summary as they stand at `point`, with each progression sorted out. */
export function applyProgressions(
  base: { fields: Record<string, unknown>; summary: string },
  progressions: readonly Progression[],
  point: StoryPoint,
  scenes: SceneIndex,
): ResolvedEntry {
  const applied: Progression[] = [];
  const later: Progression[] = [];
  const unplaced: Progression[] = [];
  for (const progression of progressions) {
    const placement = placeProgression(progression, point, scenes);
    (placement === 'applied' ? applied : placement === 'later' ? later : unplaced).push(
      progression,
    );
  }
  const byReadingOrder = point.sceneIndex !== null;
  const orderedApplied = sortProgressions(applied, scenes, byReadingOrder);
  const orderedLater = sortProgressions(later, scenes, byReadingOrder);

  const fields = { ...base.fields };
  let summary = base.summary;
  for (const progression of orderedApplied) {
    for (const [key, value] of Object.entries(progression.changes.fields ?? {})) {
      if (value === null || value === undefined) delete fields[key];
      else fields[key] = value;
    }
    if (progression.changes.summary !== undefined) summary = progression.changes.summary;
  }
  return { fields, summary, applied: orderedApplied, later: orderedLater, unplaced };
}

/** Does a dated link (or life span) hold at `point`? With no day to go by, everything shows. */
export function isActiveAt(
  from: number | null,
  to: number | null,
  point: StoryPoint | null,
): boolean {
  if (!point || point.day === null) return true;
  return (from === null || from <= point.day) && (to === null || point.day <= to);
}
