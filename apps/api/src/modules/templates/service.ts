import { and, asc, count, eq, isNull } from 'drizzle-orm';
import type { z } from 'zod';
import {
  MAX_ENTRY_TEMPLATES,
  MAX_SAVED_FILTERS,
  type EntryTemplate,
  type entryTemplateCreateSchema,
  type SavedFilter,
  type savedFilterCreateSchema,
} from '@atlas/shared';
import type { DbOrTx } from '../../db/client';
import { entities, entryTemplates, entityTypes, savedFilters, tags } from '../../db/schema';
import { conflict, notFound } from '../../errors';

// ---- Entry templates --------------------------------------------------------

type TemplateRow = typeof entryTemplates.$inferSelect;

function toTemplate(row: TemplateRow): EntryTemplate {
  return {
    id: row.id,
    typeId: row.typeId,
    name: row.name,
    summary: row.summary,
    fields: row.fields,
    body: row.body,
    visibility: row.visibility,
    createdAt: row.createdAt.toISOString(),
  };
}

async function getTemplateRow(db: DbOrTx, worldId: string, id: string): Promise<TemplateRow> {
  const [row] = await db
    .select()
    .from(entryTemplates)
    .where(and(eq(entryTemplates.id, id), eq(entryTemplates.worldId, worldId)));
  if (!row) throw notFound('Template');
  return row;
}

export async function listTemplates(
  db: DbOrTx,
  worldId: string,
  typeId?: string,
): Promise<EntryTemplate[]> {
  const rows = await db
    .select()
    .from(entryTemplates)
    .where(
      and(
        eq(entryTemplates.worldId, worldId),
        typeId ? eq(entryTemplates.typeId, typeId) : undefined,
      ),
    )
    .orderBy(asc(entryTemplates.name), asc(entryTemplates.id));
  return rows.map(toTemplate);
}

/** Copies an entry's summary, fields, text and visibility into a new template for its type. */
export async function createTemplate(
  db: DbOrTx,
  worldId: string,
  userId: string,
  input: z.output<typeof entryTemplateCreateSchema>,
): Promise<EntryTemplate> {
  const [entity] = await db
    .select()
    .from(entities)
    .where(
      and(
        eq(entities.id, input.entityId),
        eq(entities.worldId, worldId),
        isNull(entities.deletedAt),
      ),
    );
  if (!entity) throw notFound('Entry');
  const [{ total } = { total: 0 }] = await db
    .select({ total: count() })
    .from(entryTemplates)
    .where(eq(entryTemplates.worldId, worldId));
  if (total >= MAX_ENTRY_TEMPLATES) {
    throw conflict(`A world keeps up to ${MAX_ENTRY_TEMPLATES} templates. Delete one first.`);
  }
  const [row] = await db
    .insert(entryTemplates)
    .values({
      worldId,
      typeId: entity.typeId,
      name: input.name,
      summary: entity.summary,
      fields: entity.fields,
      body: entity.body,
      visibility: entity.visibility,
      createdBy: userId,
    })
    .returning();
  return toTemplate(row!);
}

export async function renameTemplate(
  db: DbOrTx,
  worldId: string,
  id: string,
  name: string,
): Promise<EntryTemplate> {
  await getTemplateRow(db, worldId, id);
  const [row] = await db
    .update(entryTemplates)
    .set({ name })
    .where(and(eq(entryTemplates.id, id), eq(entryTemplates.worldId, worldId)))
    .returning();
  return toTemplate(row!);
}

export async function deleteTemplate(db: DbOrTx, worldId: string, id: string): Promise<void> {
  await getTemplateRow(db, worldId, id);
  await db
    .delete(entryTemplates)
    .where(and(eq(entryTemplates.id, id), eq(entryTemplates.worldId, worldId)));
}

// ---- Saved filters ----------------------------------------------------------

type FilterRow = typeof savedFilters.$inferSelect;

function toFilter(row: FilterRow): SavedFilter {
  return {
    id: row.id,
    name: row.name,
    typeId: row.typeId,
    tagId: row.tagId,
    visibility: row.visibility,
    sort: row.sort === 'updated' ? 'updated' : 'name',
  };
}

/** One person's saved filters, optionally for one type. */
export async function listSavedFilters(
  db: DbOrTx,
  worldId: string,
  userId: string,
  typeId?: string,
): Promise<SavedFilter[]> {
  const rows = await db
    .select()
    .from(savedFilters)
    .where(
      and(
        eq(savedFilters.worldId, worldId),
        eq(savedFilters.userId, userId),
        typeId ? eq(savedFilters.typeId, typeId) : undefined,
      ),
    )
    .orderBy(asc(savedFilters.name), asc(savedFilters.id));
  return rows.map(toFilter);
}

export async function createSavedFilter(
  db: DbOrTx,
  worldId: string,
  userId: string,
  input: z.output<typeof savedFilterCreateSchema>,
): Promise<SavedFilter> {
  const [type] = await db
    .select({ id: entityTypes.id })
    .from(entityTypes)
    .where(and(eq(entityTypes.id, input.typeId), eq(entityTypes.worldId, worldId)));
  if (!type) throw notFound('Type');
  if (input.tagId) {
    const [tag] = await db
      .select({ id: tags.id })
      .from(tags)
      .where(and(eq(tags.id, input.tagId), eq(tags.worldId, worldId)));
    if (!tag) throw notFound('Tag');
  }
  const [{ total } = { total: 0 }] = await db
    .select({ total: count() })
    .from(savedFilters)
    .where(and(eq(savedFilters.worldId, worldId), eq(savedFilters.userId, userId)));
  if (total >= MAX_SAVED_FILTERS) {
    throw conflict(`You can keep up to ${MAX_SAVED_FILTERS} saved filters in a world.`);
  }
  const [row] = await db
    .insert(savedFilters)
    .values({
      worldId,
      userId,
      typeId: input.typeId,
      name: input.name,
      tagId: input.tagId,
      visibility: input.visibility,
      sort: input.sort,
    })
    .returning();
  return toFilter(row!);
}

export async function deleteSavedFilter(
  db: DbOrTx,
  worldId: string,
  userId: string,
  id: string,
): Promise<void> {
  const removed = await db
    .delete(savedFilters)
    .where(
      and(
        eq(savedFilters.id, id),
        eq(savedFilters.worldId, worldId),
        eq(savedFilters.userId, userId),
      ),
    )
    .returning({ id: savedFilters.id });
  if (removed.length === 0) throw notFound('Saved filter');
}
