import { and, asc, eq, getTableColumns, isNull, max, ne } from 'drizzle-orm';
import type { z } from 'zod';
import {
  ALLOWED_CHILD_KINDS,
  countWords,
  NODE_KIND_LABELS,
  richTextBlocks,
  type Appearance,
  type ManuscriptNode,
  type MentionIndexEntry,
  type nodeCreateSchema,
  type nodeMoveSchema,
  type nodeUpdateSchema,
  type RichTextDoc,
  type Scene,
} from '@atlas/shared';
import type { DbOrTx } from '../../db/client';
import { entities, manuscriptNodes, sceneMentions } from '../../db/schema';
import { badRequest, notFound } from '../../errors';
import { rebuildSceneMentions } from './mentions';

type NodeRow = typeof manuscriptNodes.$inferSelect;
const { body: _body, plainText: _plainText, ...treeColumns } = getTableColumns(manuscriptNodes);
type TreeRow = Omit<NodeRow, 'body' | 'plainText'>;

function toNode(row: TreeRow, wordCount = row.wordCount): ManuscriptNode {
  return {
    id: row.id,
    kind: row.kind,
    parentId: row.parentId,
    title: row.title,
    summary: row.summary,
    sortOrder: row.sortOrder,
    wordCount,
    povId: row.povId,
    locationId: row.locationId,
    inWorldDate: row.inWorldDate,
    updatedAt: row.updatedAt.toISOString(),
  };
}

function toScene(row: NodeRow): Scene {
  return { ...toNode(row), kind: 'scene', body: row.body };
}

async function getNodeRow(db: DbOrTx, worldId: string, nodeId: string): Promise<NodeRow> {
  const [row] = await db
    .select()
    .from(manuscriptNodes)
    .where(and(eq(manuscriptNodes.id, nodeId), eq(manuscriptNodes.worldId, worldId)));
  if (!row) throw notFound('Manuscript item');
  return row;
}

/** Throws unless `kind` may live under `parent` (or at the top level when parent is null). */
function assertPlacement(kind: NodeRow['kind'], parent: NodeRow | null) {
  const allowed = ALLOWED_CHILD_KINDS[parent ? parent.kind : 'root'];
  if (!allowed.includes(kind)) {
    const where = parent
      ? `inside a ${NODE_KIND_LABELS[parent.kind].toLowerCase()}`
      : 'at the top level';
    throw badRequest(`A ${NODE_KIND_LABELS[kind].toLowerCase()} can't go ${where}`);
  }
}

/** Proves an entity referenced as POV/location belongs to the world and isn't trashed. */
async function assertLiveEntity(db: DbOrTx, worldId: string, entityId: string) {
  const [row] = await db
    .select({ id: entities.id })
    .from(entities)
    .where(
      and(eq(entities.id, entityId), eq(entities.worldId, worldId), isNull(entities.deletedAt)),
    );
  if (!row) throw notFound('Entity');
}

/** The whole tree, flat and ordered; containers report the word total of everything inside. */
export async function listTree(db: DbOrTx, worldId: string): Promise<ManuscriptNode[]> {
  const rows = await db
    .select(treeColumns)
    .from(manuscriptNodes)
    .where(eq(manuscriptNodes.worldId, worldId))
    .orderBy(asc(manuscriptNodes.sortOrder), asc(manuscriptNodes.createdAt));

  const children = new Map<string | null, TreeRow[]>();
  for (const row of rows) children.set(row.parentId, [...(children.get(row.parentId) ?? []), row]);
  const totals = new Map<string, number>();
  const total = (row: TreeRow): number => {
    const sum =
      row.kind === 'scene'
        ? row.wordCount
        : (children.get(row.id) ?? []).reduce((acc, child) => acc + total(child), 0);
    totals.set(row.id, sum);
    return sum;
  };
  (children.get(null) ?? []).forEach(total);
  return rows.map((row) => toNode(row, totals.get(row.id) ?? 0));
}

export async function createNode(
  db: DbOrTx,
  worldId: string,
  input: z.output<typeof nodeCreateSchema>,
): Promise<ManuscriptNode> {
  const parent = input.parentId ? await getNodeRow(db, worldId, input.parentId) : null;
  assertPlacement(input.kind, parent);
  const [last] = await db
    .select({ n: max(manuscriptNodes.sortOrder) })
    .from(manuscriptNodes)
    .where(
      and(
        eq(manuscriptNodes.worldId, worldId),
        parent ? eq(manuscriptNodes.parentId, parent.id) : isNull(manuscriptNodes.parentId),
      ),
    );
  const [row] = await db
    .insert(manuscriptNodes)
    .values({
      worldId,
      kind: input.kind,
      parentId: parent?.id ?? null,
      title: input.title,
      sortOrder: (last?.n ?? -1) + 1,
    })
    .returning(treeColumns);
  return toNode(row!);
}

export async function getScene(db: DbOrTx, worldId: string, sceneId: string): Promise<Scene> {
  const row = await getNodeRow(db, worldId, sceneId);
  if (row.kind !== 'scene') throw notFound('Scene');
  return toScene(row);
}

export async function updateNode(
  db: DbOrTx,
  worldId: string,
  nodeId: string,
  input: z.output<typeof nodeUpdateSchema>,
): Promise<ManuscriptNode> {
  const existing = await getNodeRow(db, worldId, nodeId);
  const sceneOnly = [input.povId, input.locationId, input.inWorldDate].some((v) => v !== undefined);
  if (sceneOnly && existing.kind !== 'scene') {
    throw badRequest('Only scenes have a POV, location and in-world date');
  }
  for (const entityId of [input.povId, input.locationId]) {
    if (entityId) await assertLiveEntity(db, worldId, entityId);
  }
  const [row] = await db
    .update(manuscriptNodes)
    .set(input)
    .where(eq(manuscriptNodes.id, existing.id))
    .returning(treeColumns);
  return toNode(row!);
}

/** Saves a scene's text, updates its word count and refreshes what it mentions. */
export async function saveSceneBody(
  db: DbOrTx,
  worldId: string,
  sceneId: string,
  body: RichTextDoc | null,
): Promise<Scene> {
  const existing = await getNodeRow(db, worldId, sceneId);
  if (existing.kind !== 'scene') throw notFound('Scene');
  const plainText = richTextBlocks(body).join('\n');
  const [row] = await db
    .update(manuscriptNodes)
    .set({ body, plainText, wordCount: countWords(plainText) })
    .where(eq(manuscriptNodes.id, existing.id))
    .returning();
  await rebuildSceneMentions(db, worldId, [existing.id]);
  return toScene(row!);
}

/** Moves a node under a new parent at a position, renumbering its new siblings. */
export async function moveNode(
  db: DbOrTx,
  worldId: string,
  nodeId: string,
  input: z.output<typeof nodeMoveSchema>,
): Promise<ManuscriptNode[]> {
  const node = await getNodeRow(db, worldId, nodeId);
  const parent = input.parentId ? await getNodeRow(db, worldId, input.parentId) : null;
  // The strict book > part > chapter > scene nesting also rules out cycles.
  assertPlacement(node.kind, parent);

  await db.transaction(async (tx) => {
    const siblings = await tx
      .select({ id: manuscriptNodes.id })
      .from(manuscriptNodes)
      .where(
        and(
          eq(manuscriptNodes.worldId, worldId),
          parent ? eq(manuscriptNodes.parentId, parent.id) : isNull(manuscriptNodes.parentId),
          ne(manuscriptNodes.id, node.id),
        ),
      )
      .orderBy(asc(manuscriptNodes.sortOrder), asc(manuscriptNodes.createdAt));
    const ordered = siblings.map((s) => s.id);
    ordered.splice(Math.min(input.index, ordered.length), 0, node.id);
    for (const [sortOrder, id] of ordered.entries()) {
      await tx
        .update(manuscriptNodes)
        .set(id === node.id ? { sortOrder, parentId: parent?.id ?? null } : { sortOrder })
        .where(eq(manuscriptNodes.id, id));
    }
  });
  return listTree(db, worldId);
}

/** Deletes a node and everything inside it. */
export async function deleteNode(db: DbOrTx, worldId: string, nodeId: string): Promise<void> {
  const node = await getNodeRow(db, worldId, nodeId);
  await db.delete(manuscriptNodes).where(eq(manuscriptNodes.id, node.id));
}

export async function mentionIndex(db: DbOrTx, worldId: string): Promise<MentionIndexEntry[]> {
  return db
    .select({
      id: entities.id,
      name: entities.name,
      aliases: entities.aliases,
      typeId: entities.typeId,
      summary: entities.summary,
    })
    .from(entities)
    .where(and(eq(entities.worldId, worldId), isNull(entities.deletedAt)))
    .orderBy(asc(entities.name));
}

/** Scenes that mention an entity or use it as POV/location, in reading order. */
export async function listAppearances(
  db: DbOrTx,
  worldId: string,
  entityId: string,
): Promise<Appearance[]> {
  await assertLiveEntity(db, worldId, entityId);
  const [nodes, mentions] = await Promise.all([
    db
      .select({
        id: manuscriptNodes.id,
        kind: manuscriptNodes.kind,
        parentId: manuscriptNodes.parentId,
        title: manuscriptNodes.title,
        sortOrder: manuscriptNodes.sortOrder,
        povId: manuscriptNodes.povId,
        locationId: manuscriptNodes.locationId,
      })
      .from(manuscriptNodes)
      .where(eq(manuscriptNodes.worldId, worldId))
      .orderBy(asc(manuscriptNodes.sortOrder), asc(manuscriptNodes.createdAt)),
    db
      .select({ sceneId: sceneMentions.sceneId, count: sceneMentions.count })
      .from(sceneMentions)
      .innerJoin(manuscriptNodes, eq(manuscriptNodes.id, sceneMentions.sceneId))
      .where(and(eq(sceneMentions.entityId, entityId), eq(manuscriptNodes.worldId, worldId))),
  ]);

  const byId = new Map(nodes.map((n) => [n.id, n]));
  const mentionCount = new Map(mentions.map((m) => [m.sceneId, m.count]));
  const ancestor = (id: string | null, kind: 'chapter' | 'book'): string | null => {
    for (
      let node = id ? byId.get(id) : undefined;
      node;
      node = node.parentId ? byId.get(node.parentId) : undefined
    ) {
      if (node.kind === kind) return node.title;
    }
    return null;
  };

  // Depth-first walk gives reading order.
  const children = new Map<string | null, typeof nodes>();
  for (const node of nodes)
    children.set(node.parentId, [...(children.get(node.parentId) ?? []), node]);
  const appearances: Appearance[] = [];
  const walk = (parentId: string | null) => {
    for (const node of children.get(parentId) ?? []) {
      if (node.kind === 'scene') {
        const count = mentionCount.get(node.id) ?? 0;
        const asPov = node.povId === entityId;
        const asLocation = node.locationId === entityId;
        if (count > 0 || asPov || asLocation) {
          appearances.push({
            sceneId: node.id,
            sceneTitle: node.title,
            chapterTitle: ancestor(node.parentId, 'chapter'),
            bookTitle: ancestor(node.parentId, 'book'),
            mentions: count,
            asPov,
            asLocation,
          });
        }
      } else {
        walk(node.id);
      }
    }
  };
  walk(null);
  return appearances;
}

/** Scene bodies keyed by scene ID, for the world export. */
export async function getSceneBodies(
  db: DbOrTx,
  worldId: string,
): Promise<Map<string, RichTextDoc | null>> {
  const rows = await db
    .select({ id: manuscriptNodes.id, body: manuscriptNodes.body })
    .from(manuscriptNodes)
    .where(and(eq(manuscriptNodes.worldId, worldId), eq(manuscriptNodes.kind, 'scene')));
  return new Map(rows.map((r) => [r.id, r.body]));
}
