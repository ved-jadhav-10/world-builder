import { eq } from 'drizzle-orm';
import { db } from '../../db/client';
import { worlds } from '../../db/schema';
import { removeWorldMapFiles } from '../atlas/files';
import { removeWorldImageFiles } from '../gallery/files';

/**
 * Deleting an account removes the worlds it owns (the database cascades the rows) and, with them,
 * every member's access to those worlds. The uploaded files are not covered by the database, so
 * the ids are noted just before the delete and the files removed just after.
 */
const pendingRemoval = new Map<string, string[]>();

export async function noteWorldsToRemove(userId: string): Promise<void> {
  // Worlds in the trash are still the owner's, and go too.
  const owned = await db.select({ id: worlds.id }).from(worlds).where(eq(worlds.ownerId, userId));
  pendingRemoval.set(
    userId,
    owned.map((world) => world.id),
  );
}

export async function removeNotedWorldFiles(userId: string): Promise<void> {
  const worldIds = pendingRemoval.get(userId) ?? [];
  pendingRemoval.delete(userId);
  for (const worldId of worldIds) {
    await Promise.all([removeWorldMapFiles(worldId), removeWorldImageFiles(worldId)]);
  }
}
