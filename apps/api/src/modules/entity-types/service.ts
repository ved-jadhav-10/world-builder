import { and, asc, count, eq, getTableColumns, isNull, max, sql } from 'drizzle-orm';
import type { z } from 'zod';
import type {
  Audience,
  EntityType,
  entityTypeCreateSchema,
  entityTypeUpdateSchema,
} from '@atlas/shared';
import type { DbOrTx } from '../../db/client';
import { entities, entityTypes } from '../../db/schema';
import { conflict, notFound } from '../../errors';
import { uniqueKey } from '../../lib/keys';
import { visibleTo } from '../../lib/visibility';

type EntityTypeRow = typeof entityTypes.$inferSelect;

function toEntityType(row: EntityTypeRow, entityCount = 0): EntityType {
  return {
    id: row.id,
    key: row.key,
    name: row.name,
    icon: row.icon,
    color: row.color,
    fieldSchema: row.fieldSchema,
    isBuiltin: row.isBuiltin,
    sortOrder: row.sortOrder,
    startLabel: row.startLabel,
    endLabel: row.endLabel,
    entityCount,
  };
}

/** Types, with how many entries each has. Counts only include entries the audience can see. */
export async function listEntityTypes(
  db: DbOrTx,
  worldId: string,
  audience: Audience = 'gm',
): Promise<EntityType[]> {
  const visible = visibleTo(entities.visibility, audience) ?? sql`true`;
  const rows = await db
    .select({
      ...getTableColumns(entityTypes),
      entityCount:
        sql<number>`count(${entities.id}) filter (where ${entities.deletedAt} is null and ${visible})`.mapWith(
          Number,
        ),
    })
    .from(entityTypes)
    .leftJoin(entities, eq(entities.typeId, entityTypes.id))
    .where(eq(entityTypes.worldId, worldId))
    .groupBy(entityTypes.id)
    .orderBy(asc(entityTypes.sortOrder), asc(entityTypes.name));
  return rows.map(({ entityCount, ...row }) => toEntityType(row, entityCount));
}

/** Fetches a type and proves it belongs to the world. */
export async function getEntityTypeRow(
  db: DbOrTx,
  worldId: string,
  typeId: string,
): Promise<EntityTypeRow> {
  const [row] = await db
    .select()
    .from(entityTypes)
    .where(and(eq(entityTypes.id, typeId), eq(entityTypes.worldId, worldId)));
  if (!row) throw notFound('Entity type');
  return row;
}

export async function createEntityType(
  db: DbOrTx,
  worldId: string,
  input: z.output<typeof entityTypeCreateSchema>,
): Promise<EntityType> {
  const existing = await db
    .select({ key: entityTypes.key })
    .from(entityTypes)
    .where(eq(entityTypes.worldId, worldId));
  const [last] = await db
    .select({ maxOrder: max(entityTypes.sortOrder) })
    .from(entityTypes)
    .where(eq(entityTypes.worldId, worldId));

  const [row] = await db
    .insert(entityTypes)
    .values({
      ...input,
      worldId,
      key: uniqueKey(input.name, new Set(existing.map((e) => e.key)), 'type'),
      sortOrder: (last?.maxOrder ?? -1) + 1,
    })
    .returning();
  return toEntityType(row!);
}

export async function updateEntityType(
  db: DbOrTx,
  worldId: string,
  typeId: string,
  input: z.output<typeof entityTypeUpdateSchema>,
): Promise<EntityType> {
  const [row] = await db
    .update(entityTypes)
    .set(input)
    .where(and(eq(entityTypes.id, typeId), eq(entityTypes.worldId, worldId)))
    .returning();
  if (!row) throw notFound('Entity type');
  const [counted] = await db
    .select({ n: count() })
    .from(entities)
    .where(and(eq(entities.typeId, typeId), isNull(entities.deletedAt)));
  return toEntityType(row, counted?.n ?? 0);
}

export async function deleteEntityType(db: DbOrTx, worldId: string, typeId: string): Promise<void> {
  await getEntityTypeRow(db, worldId, typeId);
  // Trashed entities still reference the type, so count them too.
  const [counted] = await db
    .select({ n: count() })
    .from(entities)
    .where(eq(entities.typeId, typeId));
  const n = counted?.n ?? 0;
  if (n > 0) {
    throw conflict(
      `This type still has ${n} ${n === 1 ? 'entity' : 'entities'} (including any in Trash). Delete them first.`,
    );
  }
  await db
    .delete(entityTypes)
    .where(and(eq(entityTypes.id, typeId), eq(entityTypes.worldId, worldId)));
}
