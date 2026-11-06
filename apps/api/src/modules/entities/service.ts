import {
  and,
  asc,
  desc,
  eq,
  exists,
  inArray,
  isNotNull,
  isNull,
  or,
  sql,
  type SQL,
} from 'drizzle-orm';
import type { z } from 'zod';
import {
  deriveSearchText,
  parseFieldValues,
  type Audience,
  type BulkEntityResult,
  type bulkEntitySchema,
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
import { entities, entityTags, images, manuscriptNodes, tags } from '../../db/schema';
import { badRequest, notFound } from '../../errors';
import { visibleTo } from '../../lib/visibility';
import { getEntityTypeRow } from '../entity-types/service';
import { removeImageFiles } from '../gallery/files';
import { rebuildSceneMentions } from '../manuscript/mentions';

type EntityRow = typeof entities.$inferSelect;

export const summaryColumns = {
  id: entities.id,
  typeId: entities.typeId,
  name: entities.name,
  aliases: entities.aliases,
  summary: entities.summary,
  visibility: entities.visibility,
  scopeBookIds: entities.scopeBookIds,
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
    scopeBookIds: row.scopeBookIds,
    updatedAt: row.updatedAt.toISOString(),
  };
}

function toEntity(row: EntityRow, entityTagList: Tag[]): Entity {
  return {
    ...toSummary(row),
    fields: row.fields,
    body: row.body,
    startDay: row.startDay,
    endDay: row.endDay,
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

/**
 * Fetches a live (not trashed) entity row and proves it belongs to the world. Given the audience
 * of a read, an entry that audience can't see is "not found", exactly as if it didn't exist.
 */
export async function getEntityRow(
  db: DbOrTx,
  worldId: string,
  entityId: string,
  audience: Audience = 'gm',
): Promise<EntityRow> {
  const [row] = await db
    .select()
    .from(entities)
    .where(
      and(
        eq(entities.id, entityId),
        eq(entities.worldId, worldId),
        isNull(entities.deletedAt),
        visibleTo(entities.visibility, audience),
      ),
    );
  if (!row) throw notFound('Entity');
  return row;
}

export async function getEntity(
  db: DbOrTx,
  worldId: string,
  entityId: string,
  audience: Audience = 'gm',
): Promise<Entity> {
  const row = await getEntityRow(db, worldId, entityId, audience);
  return toEntity(row, await tagsFor(db, row.id));
}

/** The books an entry is scoped to must be books of this world; duplicates are dropped. */
async function checkBooks(db: DbOrTx, worldId: string, ids: string[]): Promise<string[]> {
  const unique = [...new Set(ids.map((id) => id.toLowerCase()))];
  if (unique.length === 0) return [];
  const found = await db
    .select({ id: manuscriptNodes.id })
    .from(manuscriptNodes)
    .where(
      and(
        eq(manuscriptNodes.worldId, worldId),
        eq(manuscriptNodes.kind, 'book'),
        inArray(manuscriptNodes.id, unique),
      ),
    );
  if (found.length !== unique.length) throw notFound('Book');
  return unique;
}

export async function createEntity(
  db: DbOrTx,
  worldId: string,
  userId: string,
  input: z.output<typeof entityCreateSchema>,
): Promise<Entity> {
  const type = await getEntityTypeRow(db, worldId, input.typeId);
  const fields = parseFieldValues(type.fieldSchema, input.fields);
  const scopeBookIds = await checkBooks(db, worldId, input.scopeBookIds);
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
      startDay: input.startDay,
      endDay: input.endDay,
      scopeBookIds,
      searchText: deriveSearchText({ ...input, fields }),
      createdBy: userId,
    })
    .returning();
  await rebuildSceneMentions(db, worldId);
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
  const startDay = input.startDay === undefined ? existing.startDay : input.startDay;
  const endDay = input.endDay === undefined ? existing.endDay : input.endDay;
  if (startDay !== null && endDay !== null && endDay < startDay) {
    throw badRequest('The end cannot come before the start');
  }
  const scopeBookIds =
    input.scopeBookIds === undefined
      ? existing.scopeBookIds
      : await checkBooks(db, worldId, input.scopeBookIds);
  const [row] = await db
    .update(entities)
    .set({ ...merged, startDay, endDay, scopeBookIds, searchText: deriveSearchText(merged) })
    .where(eq(entities.id, existing.id))
    .returning();
  // Names and aliases drive mention detection, so a rename means rescanning the manuscript.
  const renamed =
    merged.name !== existing.name ||
    JSON.stringify(merged.aliases) !== JSON.stringify(existing.aliases);
  if (renamed) await rebuildSceneMentions(db, worldId);
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
  await rebuildSceneMentions(db, worldId);
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
  await rebuildSceneMentions(db, worldId);
  return toEntity(row, await tagsFor(db, row.id));
}

/** Permanently deletes a trashed entity; its relationships and tag links cascade. */
export async function purgeEntity(db: DbOrTx, worldId: string, entityId: string): Promise<void> {
  // The picture rows go with the entry; their files need removing too.
  const pictures = await db
    .select({ id: images.id })
    .from(images)
    .where(and(eq(images.entityId, entityId), eq(images.worldId, worldId)));
  const [row] = await db
    .delete(entities)
    .where(
      and(eq(entities.id, entityId), eq(entities.worldId, worldId), isNotNull(entities.deletedAt)),
    )
    .returning({ id: entities.id });
  if (!row) throw notFound('Trashed entity');
  await Promise.all(pictures.map((picture) => removeImageFiles(worldId, picture.id)));
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
  audience: Audience = 'gm',
): Promise<Page<EntitySummary>> {
  const byName = query.sort === 'name';
  // Timestamps go through text so the cursor keeps Postgres' microsecond precision.
  const sortKey = byName
    ? sql<string>`lower(${entities.name})`
    : sql<string>`${entities.updatedAt}::text`;

  const conditions: SQL[] = [eq(entities.worldId, worldId), isNull(entities.deletedAt)];
  const visible = visibleTo(entities.visibility, audience);
  if (visible) conditions.push(visible);
  if (query.typeId) conditions.push(eq(entities.typeId, query.typeId));
  if (query.visibility) conditions.push(eq(entities.visibility, query.visibility));
  if (query.bookId) {
    // Shared entries are usable in every book; scoped ones only in the books they name.
    conditions.push(
      or(
        sql`cardinality(${entities.scopeBookIds}) = 0`,
        sql`${query.bookId}::uuid = any(${entities.scopeBookIds})`,
      )!,
    );
  }
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

/**
 * Applies one change to many entries in a single transaction. Ids that are not live entries of
 * this world (unknown, trashed, or from somewhere else) are skipped, not errors, so a stale
 * selection still does the rest.
 */
export async function bulkUpdateEntities(
  db: DbOrTx,
  worldId: string,
  input: z.output<typeof bulkEntitySchema>,
): Promise<BulkEntityResult> {
  const ids = [...new Set(input.ids)];
  const live = await db
    .select({ id: entities.id })
    .from(entities)
    .where(
      and(eq(entities.worldId, worldId), inArray(entities.id, ids), isNull(entities.deletedAt)),
    );
  const liveIds = live.map((row) => row.id);
  const result = { updated: liveIds.length, skipped: ids.length - liveIds.length };
  if (liveIds.length === 0) return result;

  switch (input.action) {
    case 'visibility':
      await db
        .update(entities)
        .set({ visibility: input.visibility })
        .where(inArray(entities.id, liveIds));
      break;
    case 'add_tag': {
      const [tag] = await db
        .select({ id: tags.id })
        .from(tags)
        .where(and(eq(tags.id, input.tagId), eq(tags.worldId, worldId)));
      if (!tag) throw notFound('Tag');
      await db
        .insert(entityTags)
        .values(liveIds.map((entityId) => ({ entityId, tagId: tag.id })))
        .onConflictDoNothing();
      break;
    }
    case 'remove_tag':
      await db
        .delete(entityTags)
        .where(and(inArray(entityTags.entityId, liveIds), eq(entityTags.tagId, input.tagId)));
      break;
    case 'trash':
      await db.update(entities).set({ deletedAt: new Date() }).where(inArray(entities.id, liveIds));
      // Names stop counting as mentions while an entry is in the trash.
      await rebuildSceneMentions(db, worldId);
      break;
  }
  return result;
}
