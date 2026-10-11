import { useMemo } from 'react';
import {
  buildSceneIndex,
  pointAtDay,
  pointAtScene,
  type Progression,
  type SceneIndex,
  type StoryPoint,
} from '@atlas/shared';
import { ancestorTitles, useManuscriptTree } from '@/lib/manuscript-tree';
import { useDates } from '@/lib/use-dates';

/** A point in the story the viewer has chosen: a scene (reading order) or an in-world date. */
export type AsOf = { kind: 'scene'; sceneId: string } | { kind: 'day'; day: number };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Reads the `asOf` link parameter: "s:<scene id>" or "d:<day number>". */
export function parseAsOf(value: string | null): AsOf | null {
  if (!value) return null;
  if (value.startsWith('s:') && UUID.test(value.slice(2))) {
    return { kind: 'scene', sceneId: value.slice(2) };
  }
  if (value.startsWith('d:')) {
    const day = Number(value.slice(2));
    if (Number.isInteger(day)) return { kind: 'day', day };
  }
  return null;
}

export const formatAsOf = (asOf: AsOf) =>
  asOf.kind === 'scene' ? `s:${asOf.sceneId}` : `d:${asOf.day}`;

export interface SceneOption {
  id: string;
  /** "Book › Chapter › Scene". */
  label: string;
  day: number | null;
}

/** Scene order and labels from the manuscript, for as-of views and progression anchors. */
export function useScenes() {
  const { tree, isPending } = useManuscriptTree();
  return useMemo(() => {
    const index: SceneIndex = buildSceneIndex(tree.nodes);
    const options: SceneOption[] = [...index.values()]
      .sort((a, b) => a.index - b.index)
      .map((scene) => {
        const node = tree.byId.get(scene.id);
        const trail = node ? [...ancestorTitles(tree, node), node.title] : [scene.title];
        return { id: scene.id, label: trail.join(' › '), day: scene.day };
      });
    return { index, options, isPending };
  }, [tree, isPending]);
}

export function useStoryPoint(asOf: AsOf | null): {
  point: StoryPoint | null;
  /** Set when the chosen scene no longer exists. */
  missing: boolean;
} {
  const { index } = useScenes();
  return useMemo(() => {
    if (!asOf) return { point: null, missing: false };
    if (asOf.kind === 'day') return { point: pointAtDay(asOf.day), missing: false };
    const point = pointAtScene(index, asOf.sceneId);
    return { point, missing: point === null };
  }, [asOf, index]);
}

/** Words for where a progression sits: its scene, its date, or that it has lost its place. */
export function useAnchorLabel() {
  const { options } = useScenes();
  const dates = useDates();
  return (progression: Pick<Progression, 'sceneId' | 'day'>): string => {
    if (progression.sceneId) {
      const scene = options.find((o) => o.id === progression.sceneId);
      return scene ? scene.label : 'A scene that no longer exists';
    }
    return progression.day !== null ? dates.date(progression.day) : 'Not placed';
  };
}
