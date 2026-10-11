import { and, eq, exists, isNull, sql } from 'drizzle-orm';
import type { z } from 'zod';
import type { Audience, Tag, tagCreateSchema, tagUpdateSchema } from '@atlas/shared';
import type { DbOrTx } from '../../db/client';
import { entities, entityTags, tags } from '../../db/schema';
import { notFound } from '../../errors';
import { visibleTo } from '../../lib/visibility';
import { getEntityRow } from '../entities/service';

const tagColumns = { id: tags.id, name: tags.name, color: tags.color };

/**
 * The world's tags. A tag's name can give away what it marks, so other audiences only get the
 * tags on entries they can see.
 */
export async function listTags(
  db: DbOrTx,
  worldId: string,
  audience: Audience = 'gm',
): Promise<Tag[]> {
  const onVisibleEntry =
    audience === 'gm'
      ? undefined
      : exists(
          db
            .select({ one: sql`1` })
            .from(entityTags)
            .innerJoin(entities, eq(entities.id, entityTags.entityId))
            .where(
              and(
                eq(entityTags.tagId, tags.id),
                isNull(entities.deletedAt),
                visibleTo(entities.visibility, audience),
              ),
            ),
        );
  return db
    .select(tagColumns)
    .from(tags)
    .where(and(eq(tags.worldId, worldId), onVisibleEntry))
    .orderBy(sql`lower(${tags.name})`);
}

async function getTag(db: DbOrTx, worldId: string, tagId: string): Promise<Tag> {
  const [tag] = await db
    .select(tagColumns)
    .from(tags)
    .where(and(eq(tags.id, tagId), eq(tags.worldId, worldId)));
  if (!tag) throw notFound('Tag');
  return tag;
}

export async function createTag(
  db: DbOrTx,
  worldId: string,
  input: z.output<typeof tagCreateSchema>,
): Promise<Tag> {
  const [tag] = await db
    .insert(tags)
    .values({ ...input, worldId })
    .returning(tagColumns);
  return tag!;
}

export async function updateTag(
  db: DbOrTx,
  worldId: string,
  tagId: string,
  input: z.output<typeof tagUpdateSchema>,
): Promise<Tag> {
  const [tag] = await db
    .update(tags)
    .set(input)
    .where(and(eq(tags.id, tagId), eq(tags.worldId, worldId)))
    .returning(tagColumns);
  if (!tag) throw notFound('Tag');
  return tag;
}

export async function deleteTag(db: DbOrTx, worldId: string, tagId: string): Promise<void> {
  const [tag] = await db
    .delete(tags)
    .where(and(eq(tags.id, tagId), eq(tags.worldId, worldId)))
    .returning({ id: tags.id });
  if (!tag) throw notFound('Tag');
}

export async function attachTag(
  db: DbOrTx,
  worldId: string,
  entityId: string,
  tagId: string,
): Promise<Tag> {
  await getEntityRow(db, worldId, entityId);
  const tag = await getTag(db, worldId, tagId);
  await db.insert(entityTags).values({ entityId, tagId }).onConflictDoNothing();
  return tag;
}

export async function detachTag(
  db: DbOrTx,
  worldId: string,
  entityId: string,
  tagId: string,
): Promise<void> {
  await getEntityRow(db, worldId, entityId);
  await db
    .delete(entityTags)
    .where(and(eq(entityTags.entityId, entityId), eq(entityTags.tagId, tagId)));
}
