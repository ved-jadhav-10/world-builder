import { and, eq, inArray, isNull } from 'drizzle-orm';
import { buildMentionMatcher, countMentions } from '@atlas/shared';
import type { DbOrTx } from '../../db/client';
import { entities, manuscriptNodes, sceneMentions } from '../../db/schema';

/**
 * Recomputes which entities each scene mentions. Pass scene IDs after a scene is saved;
 * omit them after an entity's names change (or it is trashed/restored) to rescan the world.
 */
export async function rebuildSceneMentions(
  db: DbOrTx,
  worldId: string,
  sceneIds?: string[],
): Promise<void> {
  if (sceneIds && sceneIds.length === 0) return;

  const sources = await db
    .select({ id: entities.id, name: entities.name, aliases: entities.aliases })
    .from(entities)
    .where(and(eq(entities.worldId, worldId), isNull(entities.deletedAt)));
  const matcher = buildMentionMatcher(sources);

  const sceneFilter = [eq(manuscriptNodes.worldId, worldId), eq(manuscriptNodes.kind, 'scene')];
  if (sceneIds) sceneFilter.push(inArray(manuscriptNodes.id, sceneIds));
  const scenes = await db
    .select({ id: manuscriptNodes.id, plainText: manuscriptNodes.plainText })
    .from(manuscriptNodes)
    .where(and(...sceneFilter));
  if (scenes.length === 0) return;

  const rows = scenes.flatMap((scene) =>
    [...countMentions(matcher, scene.plainText.split('\n'))].map(([entityId, count]) => ({
      sceneId: scene.id,
      entityId,
      count,
    })),
  );

  const run = async (tx: DbOrTx) => {
    await tx.delete(sceneMentions).where(
      inArray(
        sceneMentions.sceneId,
        scenes.map((s) => s.id),
      ),
    );
    if (rows.length) await tx.insert(sceneMentions).values(rows);
  };
  // Nested inside a caller's transaction this becomes a savepoint.
  await db.transaction(run);
}
