import {
  applyProgressions,
  buildSceneIndex,
  pointAtScene,
  type SceneIndex,
  type StoryPoint,
} from './progressions';
import { describeFieldValue } from './fields';
import type { ManuscriptNode, Progression } from './types';

/*
 * The arc tracker: one entry's name, details and links as they stand at the end of each chapter
 * (or scene), so the writer can see where a character changes and where they stay put.
 */

export interface ArcColumn {
  id: string;
  label: string;
  point: StoryPoint;
}

export type ArcGranularity = 'chapter' | 'scene';

/**
 * The points along the story to read an arc at, in reading order. A chapter is read as it stands
 * after its last scene. A scene outside any chapter counts as a column of its own.
 */
export function arcColumns(
  nodes: readonly ManuscriptNode[],
  granularity: ArcGranularity,
): { columns: ArcColumn[]; scenes: SceneIndex } {
  const scenes = buildSceneIndex(nodes);
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const inOrder = [...scenes.values()].sort((a, b) => a.index - b.index);
  const columns: ArcColumn[] = [];
  for (const scene of inOrder) {
    const point = pointAtScene(scenes, scene.id)!;
    if (granularity === 'scene') {
      columns.push({ id: scene.id, label: scene.title, point });
      continue;
    }
    let chapter: ManuscriptNode | undefined;
    for (let id = byId.get(scene.id)?.parentId; id; id = byId.get(id)?.parentId ?? null) {
      const node = byId.get(id);
      if (node?.kind === 'chapter') {
        chapter = node;
        break;
      }
    }
    const last = columns.at(-1);
    if (chapter && last?.id === chapter.id) last.point = point;
    else columns.push({ id: chapter?.id ?? scene.id, label: chapter?.title ?? scene.title, point });
  }
  return { columns, scenes };
}

export interface ArcRow {
  key: string;
  label: string;
  kind: 'name' | 'summary' | 'field' | 'link';
  /** What it reads at each column. */
  cells: string[];
  /** Whether each cell differs from the one before it (the first, from how the entry started). */
  changed: boolean[];
  /** Whether it ever changes along the story. */
  moves: boolean;
}

export interface ArcInput {
  entry: {
    name: string;
    aliases: string[];
    summary: string;
    fields: Record<string, unknown>;
  };
  fieldDefs: readonly { key: string; label: string }[];
  /** The entry's links, as "friend of Dov". */
  links: readonly { id: string; label: string }[];
  /** Relationship type labels by id, for a link that becomes another kind. */
  typeLabels: ReadonlyMap<string, string>;
  progressions: readonly Progression[];
  columns: readonly ArcColumn[];
  scenes: SceneIndex;
}

function valueText(value: unknown): string {
  return describeFieldValue(value) || '—';
}

/** Rows of what each part of the entry reads at each column. Only scene-placed changes count. */
export function buildArc(input: ArcInput): ArcRow[] {
  const { entry, columns, scenes } = input;
  const states = columns.map((column) =>
    applyProgressions(entry, input.progressions, column.point, scenes),
  );
  // How the entry started, before every change.
  const none = applyProgressions(entry, [], { sceneIndex: null, day: null }, scenes);

  const row = (
    key: string,
    label: string,
    kind: ArcRow['kind'],
    read: (state: typeof none) => string,
  ): ArcRow => {
    const cells = states.map(read);
    let previous = read(none);
    const changed = cells.map((cell) => {
      const differs = cell !== previous;
      previous = cell;
      return differs;
    });
    return { key, label, kind, cells, changed, moves: changed.some(Boolean) };
  };

  const rows: ArcRow[] = [
    row('name', 'Name', 'name', (s) => valueText(s.name)),
    row('summary', 'Summary', 'summary', (s) => valueText(s.summary)),
    ...input.fieldDefs.map((def) =>
      row(`field:${def.key}`, def.label, 'field', (s) => valueText(s.fields[def.key])),
    ),
    ...input.links.map((link) =>
      row(`link:${link.id}`, link.label, 'link', (s) => {
        const state = s.links.get(link.id);
        if (state?.ended) return 'Ended';
        const kind = state?.typeId ? input.typeLabels.get(state.typeId) : undefined;
        return kind ? `Now ${kind}` : 'Active';
      }),
    ),
  ];
  return rows;
}
