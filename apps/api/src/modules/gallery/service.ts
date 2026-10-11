import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { and, asc, desc, eq, isNotNull, isNull, or, type SQL } from 'drizzle-orm';
import type { z } from 'zod';
import type {
  Audience,
  GalleryImage,
  imageCreateSchema,
  ImageListQuery,
  imageUpdateSchema,
} from '@atlas/shared';
import type { DbOrTx } from '../../db/client';
import { entities, images, manuscriptNodes } from '../../db/schema';
import { badRequest, notFound } from '../../errors';
import { visibleTo } from '../../lib/visibility';
import { getEntityRow } from '../entities/service';
import { fullPath, removeImageFiles, thumbPath } from './files';
import { storeImage } from './processing';

/**
 * Images with the name of the entry they belong to. An image of an entry is only listed while
 * that entry is live and visible to the audience, so a trashed or hidden entry takes its pictures
 * with it.
 */
function selectImages(db: DbOrTx, audience: Audience) {
  return db
    .select({ image: images, entityName: entities.name })
    .from(images)
    .leftJoin(
      entities,
      and(
        eq(entities.id, images.entityId),
        isNull(entities.deletedAt),
        visibleTo(entities.visibility, audience),
      ),
    );
}

/** Which images an audience can see: shared with them, and any entry they belong to visible too. */
function imageVisible(audience: Audience): SQL | undefined {
  return and(
    visibleTo(images.visibility, audience),
    or(isNull(images.entityId), isNotNull(entities.id)),
  );
}

function toImage(row: Awaited<ReturnType<typeof selectImages>>[number]): GalleryImage {
  const { image } = row;
  return {
    id: image.id,
    entityId: image.entityId,
    entityName: row.entityName,
    caption: image.caption,
    visibility: image.visibility,
    sceneId: image.sceneId,
    day: image.day,
    isPortrait: image.isPortrait,
    width: image.width,
    height: image.height,
    bytes: image.bytes,
    createdAt: image.createdAt.toISOString(),
  };
}

async function assertScene(db: DbOrTx, worldId: string, sceneId: string) {
  const [row] = await db
    .select({ id: manuscriptNodes.id })
    .from(manuscriptNodes)
    .where(
      and(
        eq(manuscriptNodes.id, sceneId),
        eq(manuscriptNodes.worldId, worldId),
        eq(manuscriptNodes.kind, 'scene'),
      ),
    );
  if (!row) throw notFound('Scene');
}

export async function listImages(
  db: DbOrTx,
  worldId: string,
  query: ImageListQuery,
  audience: Audience = 'gm',
): Promise<GalleryImage[]> {
  if (query.entityId) await getEntityRow(db, worldId, query.entityId, audience);
  const rows = await selectImages(db, audience)
    .where(
      and(
        eq(images.worldId, worldId),
        query.entityId ? eq(images.entityId, query.entityId) : undefined,
        query.scope === 'world' ? isNull(images.entityId) : undefined,
        imageVisible(audience),
      ),
    )
    // An entry's portrait comes first, then pictures in the order they were added.
    .orderBy(desc(images.isPortrait), asc(images.createdAt));
  return rows.map(toImage);
}

async function getImageRow(
  db: DbOrTx,
  worldId: string,
  imageId: string,
  audience: Audience = 'gm',
) {
  const [row] = await selectImages(db, audience).where(
    and(eq(images.id, imageId), eq(images.worldId, worldId), imageVisible(audience)),
  );
  if (!row) throw notFound('Image');
  return row;
}

export async function getImage(
  db: DbOrTx,
  worldId: string,
  imageId: string,
  audience: Audience = 'gm',
): Promise<GalleryImage> {
  return toImage(await getImageRow(db, worldId, imageId, audience));
}

async function readImageFile(path: string): Promise<Buffer> {
  try {
    return await readFile(path);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') throw notFound('Image');
    throw error;
  }
}

export async function readImage(
  db: DbOrTx,
  worldId: string,
  imageId: string,
  which: 'full' | 'thumb',
  audience: Audience,
): Promise<Buffer> {
  await getImageRow(db, worldId, imageId, audience);
  return readImageFile(which === 'full' ? fullPath(worldId, imageId) : thumbPath(worldId, imageId));
}

/** Makes `imageId` the only portrait of its entry. */
async function claimPortrait(db: DbOrTx, entityId: string, imageId: string) {
  await db
    .update(images)
    .set({ isPortrait: false })
    .where(and(eq(images.entityId, entityId), eq(images.isPortrait, true)));
  await db.update(images).set({ isPortrait: true }).where(eq(images.id, imageId));
}

export async function createImage(
  db: DbOrTx,
  worldId: string,
  userId: string,
  input: z.output<typeof imageCreateSchema>,
  sourcePath: string,
): Promise<GalleryImage> {
  if (input.entityId) await getEntityRow(db, worldId, input.entityId);
  if (input.sceneId) await assertScene(db, worldId, input.sceneId);
  if (input.portrait && !input.entityId) throw badRequest('Only an entry can have a portrait');

  const id = randomUUID();
  try {
    const stored = await storeImage(sourcePath, worldId, id);
    await db.transaction(async (tx) => {
      await tx.insert(images).values({
        id,
        worldId,
        entityId: input.entityId,
        caption: input.caption,
        visibility: input.visibility,
        sceneId: input.sceneId,
        day: input.day,
        width: stored.width,
        height: stored.height,
        bytes: stored.bytes,
        createdBy: userId,
      });
      // An entry's first picture becomes its portrait, unless a portrait is already set.
      if (input.entityId) {
        const [existing] = await tx
          .select({ id: images.id })
          .from(images)
          .where(and(eq(images.entityId, input.entityId), eq(images.isPortrait, true)));
        if (input.portrait || !existing) await claimPortrait(tx, input.entityId, id);
      }
    });
  } catch (error) {
    await removeImageFiles(worldId, id);
    throw error;
  }
  return getImage(db, worldId, id);
}

export async function updateImage(
  db: DbOrTx,
  worldId: string,
  imageId: string,
  input: z.output<typeof imageUpdateSchema>,
): Promise<GalleryImage> {
  const { image: existing } = await getImageRow(db, worldId, imageId);

  const entityId = input.entityId === undefined ? existing.entityId : input.entityId;
  if (input.entityId) await getEntityRow(db, worldId, input.entityId);

  // Tagging to a scene clears a date, and the other way round, unless both are sent.
  let sceneId = input.sceneId === undefined ? existing.sceneId : input.sceneId;
  let day = input.day === undefined ? existing.day : input.day;
  if (input.sceneId && input.day === undefined) day = null;
  if (input.day !== undefined && input.day !== null && input.sceneId === undefined) sceneId = null;
  if (sceneId !== null && day !== null) throw badRequest('Tag it to a scene or a date, not both');
  if (sceneId) await assertScene(db, worldId, sceneId);

  const wantsPortrait = input.portrait ?? (existing.isPortrait && entityId === existing.entityId);
  if (wantsPortrait && !entityId) throw badRequest('Only an entry can have a portrait');

  await db.transaction(async (tx) => {
    await tx
      .update(images)
      .set({
        caption: input.caption ?? existing.caption,
        visibility: input.visibility ?? existing.visibility,
        entityId,
        sceneId,
        day,
        isPortrait: false, // Set below, once any other portrait has been cleared.
      })
      .where(eq(images.id, existing.id));
    if (wantsPortrait && entityId) await claimPortrait(tx, entityId, existing.id);
  });
  return getImage(db, worldId, imageId);
}

export async function deleteImage(db: DbOrTx, worldId: string, imageId: string): Promise<void> {
  const { image } = await getImageRow(db, worldId, imageId);
  await db.transaction(async (tx) => {
    await tx.delete(images).where(eq(images.id, image.id));
    // The entry keeps a portrait: its oldest remaining picture steps in.
    if (image.isPortrait && image.entityId) {
      const [next] = await tx
        .select({ id: images.id })
        .from(images)
        .where(eq(images.entityId, image.entityId))
        .orderBy(asc(images.createdAt))
        .limit(1);
      if (next) await claimPortrait(tx, image.entityId, next.id);
    }
  });
  await removeImageFiles(worldId, image.id);
}

/** Every image in the world, for the export. */
export async function listWorldImages(db: DbOrTx, worldId: string): Promise<GalleryImage[]> {
  const rows = await selectImages(db, 'gm')
    .where(eq(images.worldId, worldId))
    .orderBy(asc(images.createdAt));
  return rows.map(toImage);
}
