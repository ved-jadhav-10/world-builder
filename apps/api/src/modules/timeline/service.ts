import { and, asc, eq, inArray, isNotNull, isNull, or, sql } from 'drizzle-orm';
import type { Audience, TimelineData } from '@atlas/shared';
import type { DbOrTx } from '../../db/client';
import { entities, entityTags } from '../../db/schema';
import { visibleTo } from '../../lib/visibility';
import { listTree } from '../manuscript/service';

/** Everything that has a date: entries with a start or end, and scenes with a day. */
export async function getTimeline(
  db: DbOrTx,
  worldId: string,
  audience: Audience = 'gm',
): Promise<TimelineData> {
  const [entityRows, tree] = await Promise.all([
    db
      .select({
        id: entities.id,
        typeId: entities.typeId,
        name: entities.name,
        startDay: entities.startDay,
        endDay: entities.endDay,
      })
      .from(entities)
      .where(
        and(
          eq(entities.worldId, worldId),
          isNull(entities.deletedAt),
          visibleTo(entities.visibility, audience),
          or(isNotNull(entities.startDay), isNotNull(entities.endDay)),
        ),
      )
      .orderBy(asc(sql`coalesce(${entities.startDay}, ${entities.endDay})`), asc(entities.name)),
    // Scenes belong to the author's manuscript, which other audiences don't see.
    audience === 'gm' ? listTree(db, worldId) : Promise.resolve([]),
  ]);

  const tagRows =
    entityRows.length === 0
      ? []
      : await db
          .select({ entityId: entityTags.entityId, tagId: entityTags.tagId })
          .from(entityTags)
          .where(
            inArray(
              entityTags.entityId,
              entityRows.map((e) => e.id),
            ),
          );
  const tagsByEntity = new Map<string, string[]>();
  for (const row of tagRows) {
    tagsByEntity.set(row.entityId, [...(tagsByEntity.get(row.entityId) ?? []), row.tagId]);
  }

  const byId = new Map(tree.map((node) => [node.id, node]));
  const ancestorTitle = (parentId: string | null, kind: 'chapter' | 'book') => {
    for (let node = parentId ? byId.get(parentId) : undefined; node;) {
      if (node.kind === kind) return node.title;
      node = node.parentId ? byId.get(node.parentId) : undefined;
    }
    return null;
  };

  return {
    entities: entityRows.map((e) => ({ ...e, tagIds: tagsByEntity.get(e.id) ?? [] })),
    scenes: tree
      .filter((node) => node.kind === 'scene' && node.inWorldDay !== null)
      .map((scene) => ({
        id: scene.id,
        title: scene.title,
        day: scene.inWorldDay!,
        chapterTitle: ancestorTitle(scene.parentId, 'chapter'),
        bookTitle: ancestorTitle(scene.parentId, 'book'),
      }))
      .sort((a, b) => a.day - b.day),
  };
}
