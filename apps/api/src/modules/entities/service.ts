import { and, asc, desc, eq, exists, isNotNull, isNull, sql, type SQL } from 'drizzle-orm';
import type { z } from 'zod';
import {
  deriveSearchText,
  parseFieldValues,
  type Entity,
  type entityCreateSchema,
  type entityListQuerySchema,
  type EntitySummary,
  type entityUpdateSchema,
  type Page,
  type Tag,
  type TrashedEntity,
} from '@atlas/shared';
import type { DbOrTx } from '../../db/client';
import { entities, entityTags, tags } from '../../db/schema';
import { badRequest, notFound } from '../../errors';
import { getEntityTypeRow } from '../entity-types/service';

type EntityRow = typeof entities.$inferSelect;

export const summaryColumns = {
  id: entities.id,
  typeId: entities.typeId,
  name: entities.name,
  aliases: entities.aliases,
  summary: entities.summary,
  visibility: entities.visibility,
  updatedAt: entities.updatedAt,
};

type SummaryRow = { [K in keyof typeof summaryColumns]: EntityRow[K] };

export function toSummary(row: SummaryRow): EntitySummary {
  return {
    id: row.id,
    typeId: row.typeId,
    name: row.name,
    aliases: row.aliases,
    summary: row.summary,
    visibility: row.visibility,
    updatedAt: row.updatedAt.toISOString(),
  };
}

function toEntity(row: EntityRow, entityTagList: Tag[]): Entity {
  return {
    ...toSummary(row),
    fields: row.fields,
    body: row.body,
    tags: entityTagList,
    createdAt: row.createdAt.toISOString(),
  };
}

async function tagsFor(db: DbOrTx, entityId: string): Promise<Tag[]> {
  return db
    .select({ id: tags.id, name: tags.name, color: tags.color })
    .from(entityTags)
    .innerJoin(tags, eq(tags.id, entityTags.tagId))
    .where(eq(entityTags.entityId, entityId))
    .orderBy(sql`lower(${tags.name})`);
}

/** Fetches a live (not trashed) entity row and proves it belongs to the world. */
export async function getEntityRow(
  db: DbOrTx,
  worldId: string,
  entityId: string,
): Promise<EntityRow> {
  const [row] = await db
    .select()
    .from(entities)
    .where(
      and(eq(entities.id, entityId), eq(entities.worldId, worldId), isNull(entities.deletedAt)),
    );
  if (!row) throw notFound('Entity');
  return row;
}

export async function getEntity(db: DbOrTx, worldId: string, entityId: string): Promise<Entity> {
  const row = await getEntityRow(db, worldId, entityId);
  return toEntity(row, await tagsFor(db, row.id));
}

export async function createEntity(
  db: DbOrTx,
  worldId: string,
  userId: string,
  input: z.output<typeof entityCreateSchema>,
): Promise<Entity> {
  const type = await getEntityTypeRow(db, worldId, input.typeId);
  const fields = parseFieldValues(type.fieldSchema, input.fields);
  const [row] = await db
    .insert(entities)
    .values({
      worldId,
      typeId: type.id,
      name: input.name,
      aliases: input.aliases,
      summary: input.summary,
      fields,
      body: input.body,
      visibility: input.visibility,
      searchText: deriveSearchText({ ...input, fields }),
      createdBy: userId,
    })
    .returning();
  return toEntity(row!, []);
}

export async function updateEntity(
  db: DbOrTx,
  worldId: string,
  entityId: string,
  input: z.output<typeof entityUpdateSchema>,
): Promise<Entity> {
  const existing = await getEntityRow(db, worldId, entityId);
  const fields =
    input.fields === undefined
      ? existing.fields
      : parseFieldValues(
          (await getEntityTypeRow(db, worldId, existing.typeId)).fieldSchema,
          input.fields,
        );

  const merged = {
    name: input.name ?? existing.name,
    aliases: input.aliases ?? existing.aliases,
    summary: input.summary ?? existing.summary,
    body: input.body === undefined ? existing.body : input.body,
    visibility: input.visibility ?? existing.visibility,
    fields,
  };
  const [row] = await db
    .update(entities)
    .set({ ...merged, searchText: deriveSearchText(merged) })
    .where(eq(entities.id, existing.id))
    .returning();
  return toEntity(row!, await tagsFor(db, existing.id));
}

export async function softDeleteEntity(
  db: DbOrTx,
  worldId: string,
  entityId: string,
): Promise<void> {
  const [row] = await db
    .update(entities)
    .set({ deletedAt: new Date() })
    .where(
      and(eq(entities.id, entityId), eq(entities.worldId, worldId), isNull(entities.deletedAt)),
    )
    .returning({ id: entities.id });
  if (!row) throw notFound('Entity');
}

export async function restoreEntity(
  db: DbOrTx,
  worldId: string,
  entityId: string,
): Promise<Entity> {
  const [row] = await db
    .update(entities)
    .set({ deletedAt: null })
    .where(
      and(eq(entities.id, entityId), eq(entities.worldId, worldId), isNotNull(entities.deletedAt)),
    )
    .returning();
  if (!row) throw notFound('Trashed entity');
  return toEntity(row, await tagsFor(db, row.id));
}

/** Permanently deletes a trashed entity; its relationships and tag links cascade. */
export async function purgeEntity(db: DbOrTx, worldId: string, entityId: string): Promise<void> {
  const [row] = await db
    .delete(entities)
    .where(
      and(eq(entities.id, entityId), eq(entities.worldId, worldId), isNotNull(entities.deletedAt)),
    )
    .returning({ id: entities.id });
  if (!row) throw notFound('Trashed entity');
}

export async function listTrash(db: DbOrTx, worldId: string): Promise<TrashedEntity[]> {
  const rows = await db
    .select({ ...summaryColumns, deletedAt: entities.deletedAt })
    .from(entities)
    .where(and(eq(entities.worldId, worldId), isNotNull(entities.deletedAt)))
    .orderBy(desc(entities.deletedAt))
    .limit(500);
  return rows.map(({ deletedAt, ...row }) => ({
    ...toSummary(row),
    deletedAt: deletedAt!.toISOString(),
  }));
}

// Keyset pagination: the cursor is the last row's [sortKey, id], so pages stay
// stable while entities are added or renamed.
const encodeCursor = (sortKey: string, id: string) =>
  Buffer.from(JSON.stringify([sortKey, id])).toString('base64url');

function decodeCursor(cursor: string): [string, string] {
  try {
    const value: unknown = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8'));
    if (Array.isArray(value) && value.length === 2 && value.every((v) => typeof v === 'string')) {
      return value as [string, string];
    }
  } catch {
    // fall through
  }
  throw badRequest('Invalid cursor');
}

export async function listEntities(
  db: DbOrTx,
  worldId: string,
  query: z.output<typeof entityListQuerySchema>,
): Promise<Page<EntitySummary>> {
  const byName = query.sort === 'name';
  // Timestamps go through text so the cursor keeps Postgres' microsecond precision.
  const sortKey = byName
    ? sql<string>`lower(${entities.name})`
    : sql<string>`${entities.updatedAt}::text`;

  const conditions: SQL[] = [eq(entities.worldId, worldId), isNull(entities.deletedAt)];
  if (query.typeId) conditions.push(eq(entities.typeId, query.typeId));
  if (query.tagId) {
    conditions.push(
      exists(
        db
          .select({ one: sql`1` })
          .from(entityTags)
          .where(and(eq(entityTags.entityId, entities.id), eq(entityTags.tagId, query.tagId))),
      ),
    );
  }
  if (query.cursor) {
    const [key, id] = decodeCursor(query.cursor);
    conditions.push(
      byName
        ? sql`(lower(${entities.name}), ${entities.id}) > (${key}, ${id}::uuid)`
        : sql`(${entities.updatedAt}, ${entities.id}) < (${key}::timestamptz, ${id}::uuid)`,
    );
  }

  const rows = await db
    .select({ ...summaryColumns, sortKey })
    .from(entities)
    .where(and(...conditions))
    .orderBy(
      ...(byName
        ? [asc(sortKey), asc(entities.id)]
        : [desc(entities.updatedAt), desc(entities.id)]),
    )
    .limit(query.limit + 1);

  const page = rows.slice(0, query.limit);
  const last = page.at(-1);
  return {
    items: page.map(toSummary),
    nextCursor: rows.length > query.limit && last ? encodeCursor(last.sortKey, last.id) : null,
  };
}
