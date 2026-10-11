import { and, asc, eq, inArray, isNull, or } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import {
  QUEST_STATUS_FIELD,
  QUEST_TYPE_KEY,
  type Audience,
  type Entity,
  type QuestSummary,
} from '@atlas/shared';
import type { DbOrTx } from '../../db/client';
import { entities, entityTypes, relationships, relationshipTypes } from '../../db/schema';
import { badRequest, notFound } from '../../errors';
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

  // One query for every link, in both directions, to entries the audience can see.
  const ids = quests.map((q) => q.id);
  const other = alias(entities, 'other');
  const links = await db
    .select({
      id: relationships.id,
      sourceId: relationships.sourceId,
      targetId: relationships.targetId,
      label: relationshipTypes.label,
      inverseLabel: relationshipTypes.inverseLabel,
      otherId: other.id,
      otherName: other.name,
      otherTypeId: other.typeId,
    })
    .from(relationships)
    .innerJoin(relationshipTypes, eq(relationshipTypes.id, relationships.typeId))
    .innerJoin(
      other,
      or(
        and(inArray(relationships.sourceId, ids), eq(other.id, relationships.targetId)),
        and(inArray(relationships.targetId, ids), eq(other.id, relationships.sourceId)),
      ),
    )
    .where(
      and(
        eq(relationships.worldId, worldId),
        isNull(relationships.deletedAt),
        isNull(other.deletedAt),
        visibleTo(other.visibility, audience),
      ),
    )
    .orderBy(asc(other.name));

  const byQuest = new Map<string, QuestSummary['links']>();
  for (const link of links) {
    const outgoing = ids.includes(link.sourceId);
    const questId = outgoing ? link.sourceId : link.targetId;
    byQuest.set(questId, [
      ...(byQuest.get(questId) ?? []),
      {
        label: outgoing ? link.label : link.inverseLabel,
        other: { id: link.otherId, name: link.otherName, typeId: link.otherTypeId },
      },
    ]);
  }

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
