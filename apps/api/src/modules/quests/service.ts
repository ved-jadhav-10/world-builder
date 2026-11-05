import { and, asc, eq, isNull } from 'drizzle-orm';
import {
  QUEST_STATUS_FIELD,
  QUEST_TYPE_KEY,
  type Audience,
  type Entity,
  type QuestSummary,
} from '@atlas/shared';
import type { DbOrTx } from '../../db/client';
import { entities, entityTypes } from '../../db/schema';
import { badRequest, notFound } from '../../errors';
import { loadEntryLinks } from '../../lib/entry-links';
import { visibleTo } from '../../lib/visibility';
import { getEntityRow, updateEntity } from '../entities/service';

async function questTypeId(db: DbOrTx, worldId: string): Promise<string | null> {
  const [type] = await db
    .select({ id: entityTypes.id })
    .from(entityTypes)
    .where(and(eq(entityTypes.worldId, worldId), eq(entityTypes.key, QUEST_TYPE_KEY)));
  return type?.id ?? null;
}

/**
 * Every quest the audience can see, with what each is linked to. Quests are ordinary entries of
 * the built-in "quest" type, so visibility, search, tags and relationships all work as usual.
 */
export async function listQuests(
  db: DbOrTx,
  worldId: string,
  audience: Audience = 'gm',
): Promise<QuestSummary[]> {
  const typeId = await questTypeId(db, worldId);
  if (!typeId) return [];
  const quests = await db
    .select({
      id: entities.id,
      name: entities.name,
      summary: entities.summary,
      fields: entities.fields,
      visibility: entities.visibility,
      updatedAt: entities.updatedAt,
    })
    .from(entities)
    .where(
      and(
        eq(entities.worldId, worldId),
        eq(entities.typeId, typeId),
        isNull(entities.deletedAt),
        visibleTo(entities.visibility, audience),
      ),
    )
    .orderBy(asc(entities.name));
  if (quests.length === 0) return [];

  const byQuest = await loadEntryLinks(
    db,
    worldId,
    quests.map((quest) => quest.id),
    audience,
  );

  return quests.map((quest) => {
    const status = quest.fields[QUEST_STATUS_FIELD];
    return {
      id: quest.id,
      name: quest.name,
      summary: quest.summary,
      status: typeof status === 'string' ? status : '',
      visibility: quest.visibility,
      updatedAt: quest.updatedAt.toISOString(),
      links: byQuest.get(quest.id) ?? [],
    };
  });
}

/** Moves a quest to another status, leaving its other details alone. */
export async function setQuestStatus(
  db: DbOrTx,
  worldId: string,
  questId: string,
  status: string,
): Promise<Entity> {
  const typeId = await questTypeId(db, worldId);
  const quest = await getEntityRow(db, worldId, questId);
  if (!typeId || quest.typeId !== typeId) throw notFound('Quest');
  if (status.trim() === '') throw badRequest('A quest needs a status');
  // The type's own field rules decide whether this is an allowed status.
  return updateEntity(db, worldId, questId, {
    fields: { ...quest.fields, [QUEST_STATUS_FIELD]: status },
  });
}
