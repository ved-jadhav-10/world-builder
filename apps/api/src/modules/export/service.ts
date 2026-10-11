import { and, asc, eq, inArray, isNull } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import type { WorldExport } from '@atlas/shared';
import type { DbOrTx } from '../../db/client';
import { entities, entityTags, entityTypes, relationships, relationshipTypes, tags, worlds } from '../../db/schema';
import { notFound } from '../../errors';

/** Everything in a world as one JSON document. Trashed entities are left out. */
export async function exportWorld(db: DbOrTx, worldId: string): Promise<WorldExport> {
  const [world] = await db.select().from(worlds).where(eq(worlds.id, worldId));
  if (!world) throw notFound('World');

  const [typeRows, relTypeRows, tagRows, entityRows] = await Promise.all([
    db.select().from(entityTypes).where(eq(entityTypes.worldId, worldId)).orderBy(asc(entityTypes.sortOrder)),
    db.select().from(relationshipTypes).where(eq(relationshipTypes.worldId, worldId)),
    db.select().from(tags).where(eq(tags.worldId, worldId)),
    db
      .select()
      .from(entities)
      .where(and(eq(entities.worldId, worldId), isNull(entities.deletedAt)))
      .orderBy(asc(entities.name)),
  ]);

  const entityIds = entityRows.map((e) => e.id);
  const source = alias(entities, 'source');
  const target = alias(entities, 'target');
  const [tagLinks, relationshipRows] = await Promise.all([
    entityIds.length
      ? db.select().from(entityTags).where(inArray(entityTags.entityId, entityIds))
      : Promise.resolve([]),
    db
      .select({ relationship: relationships })
      .from(relationships)
      .innerJoin(source, eq(source.id, relationships.sourceId))
      .innerJoin(target, eq(target.id, relationships.targetId))
      .where(
        and(
          eq(relationships.worldId, worldId),
          isNull(relationships.deletedAt),
          isNull(source.deletedAt),
          isNull(target.deletedAt),
        ),
      ),
  ]);

  const tagIdsByEntity = new Map<string, string[]>();
  for (const link of tagLinks) {
    tagIdsByEntity.set(link.entityId, [...(tagIdsByEntity.get(link.entityId) ?? []), link.tagId]);
  }

  return {
    format: 'atlas-ink.world',
    version: 1,
    exportedAt: new Date().toISOString(),
    world: {
      id: world.id,
      name: world.name,
      slug: world.slug,
      description: world.description,
      createdAt: world.createdAt.toISOString(),
    },
    entityTypes: typeRows.map((t) => ({
      id: t.id,
      key: t.key,
      name: t.name,
      icon: t.icon,
      color: t.color,
      fieldSchema: t.fieldSchema,
      isBuiltin: t.isBuiltin,
      sortOrder: t.sortOrder,
    })),
    relationshipTypes: relTypeRows.map((t) => ({
      id: t.id,
      key: t.key,
      label: t.label,
      inverseLabel: t.inverseLabel,
      isBuiltin: t.isBuiltin,
    })),
    tags: tagRows.map((t) => ({ id: t.id, name: t.name, color: t.color })),
    entities: entityRows.map((e) => ({
      id: e.id,
      typeId: e.typeId,
      name: e.name,
      aliases: e.aliases,
      summary: e.summary,
      visibility: e.visibility,
      fields: e.fields,
      body: e.body,
      tagIds: tagIdsByEntity.get(e.id) ?? [],
      createdAt: e.createdAt.toISOString(),
      updatedAt: e.updatedAt.toISOString(),
    })),
    relationships: relationshipRows.map(({ relationship: r }) => ({
      id: r.id,
      sourceId: r.sourceId,
      targetId: r.targetId,
      typeId: r.typeId,
      notes: r.notes,
      validFromDay: r.validFromDay,
      validToDay: r.validToDay,
    })),
  };
}
