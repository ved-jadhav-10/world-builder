import { and, eq, isNull } from 'drizzle-orm';
import { analyzeWords, wordsOfNames, type NodeKind, type WordCheckResult } from '@atlas/shared';
import type { DbOrTx } from '../../db/client';
import { entities, manuscriptNodes } from '../../db/schema';
import { notFound } from '../../errors';

interface Row {
  id: string;
  parentId: string | null;
  kind: NodeKind;
  title: string;
  sortOrder: number;
  plainText: string;
}

/**
 * Checks the text of the manuscript, or of one book, part, chapter or scene, for the habits a
 * writer wants to see: most used words, crutch words, adverbs, close repeats. The names of the
 * world's entries (and their aliases) are left out of the word lists, since a character called
 * Mira will naturally be the most used word.
 */
export async function wordCheck(
  db: DbOrTx,
  worldId: string,
  options: { nodeId?: string; watch: string },
): Promise<WordCheckResult> {
  const nodes: Row[] = await db
    .select({
      id: manuscriptNodes.id,
      parentId: manuscriptNodes.parentId,
      kind: manuscriptNodes.kind,
      title: manuscriptNodes.title,
      sortOrder: manuscriptNodes.sortOrder,
      plainText: manuscriptNodes.plainText,
    })
    .from(manuscriptNodes)
    .where(eq(manuscriptNodes.worldId, worldId));

  const children = new Map<string | null, Row[]>();
  for (const node of nodes) {
    const list = children.get(node.parentId) ?? [];
    list.push(node);
    children.set(node.parentId, list);
  }
  for (const list of children.values()) {
    list.sort((a, b) => a.sortOrder - b.sortOrder || (a.id < b.id ? -1 : 1));
  }

  const root = options.nodeId ? nodes.find((n) => n.id === options.nodeId) : undefined;
  if (options.nodeId && !root) throw notFound('Manuscript item');

  // Scenes under the chosen node, in reading order.
  const scenes: Row[] = [];
  const walk = (node: Row) => {
    if (node.kind === 'scene') scenes.push(node);
    for (const child of children.get(node.id) ?? []) walk(child);
  };
  if (root) walk(root);
  else for (const top of children.get(null) ?? []) walk(top);

  const entryRows = await db
    .select({ name: entities.name, aliases: entities.aliases })
    .from(entities)
    .where(and(eq(entities.worldId, worldId), isNull(entities.deletedAt)));
  const ignore = wordsOfNames(entryRows.flatMap((row) => [row.name, ...row.aliases]));

  const check = analyzeWords(scenes.map((scene) => scene.plainText).join('\n\n'), {
    ignore,
    watch: options.watch.split(','),
  });
  return {
    scope: {
      id: root?.id ?? null,
      title: root?.title ?? 'Whole manuscript',
      kind: root?.kind ?? null,
      scenes: scenes.length,
    },
    check,
  };
}
