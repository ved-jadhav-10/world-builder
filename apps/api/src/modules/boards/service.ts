import { and, count, desc, eq, inArray, isNull, sql } from 'drizzle-orm';
import type { z } from 'zod';
import {
  MAX_BOARDS,
  boardForPlayers,
  type Audience,
  type Board,
  type BoardDoc,
  type BoardEntry,
  type BoardImage,
  type BoardKind,
  type BoardSummary,
  type boardCreateSchema,
  type boardUpdateSchema,
} from '@atlas/shared';
import type { DbOrTx } from '../../db/client';
import { boards, entities } from '../../db/schema';
import { conflict, notFound } from '../../errors';
import { visibleTo } from '../../lib/visibility';
import { portraitsFor, visibleImagesById } from '../gallery/service';

type Row = typeof boards.$inferSelect;

/** Players see only boards shown to them; readers and the public see none. */
function boardVisible(audience: Audience) {
  if (audience === 'gm') return undefined;
  return audience === 'player' ? eq(boards.shared, true) : sql`false`;
}

async function getRow(db: DbOrTx, worldId: string, id: string, audience: Audience): Promise<Row> {
  const [row] = await db
    .select()
    .from(boards)
    .where(and(eq(boards.id, id), eq(boards.worldId, worldId), boardVisible(audience)));
  if (!row) throw notFound('Board');
  return row;
}

const entryIds = (doc: BoardDoc) => [
  ...new Set(doc.items.flatMap((item) => (item.type === 'entry' ? [item.entityId] : []))),
];
const imageIds = (doc: BoardDoc) => [
  ...new Set(doc.items.flatMap((item) => (item.type === 'image' ? [item.imageId] : []))),
];

/**
 * A board with the entries and pictures its cards point to, as the audience may see them. Entries
 * in the trash, in another world or hidden from the audience are simply absent, so an ID on a
 * board never reveals anything by itself.
 */
async function toBoard(db: DbOrTx, row: Row, audience: Audience): Promise<Board> {
  const ids = entryIds(row.doc);
  const entryRows =
    ids.length === 0
      ? []
      : await db
          .select({
            id: entities.id,
            name: entities.name,
            typeId: entities.typeId,
            summary: entities.summary,
            visibility: entities.visibility,
          })
          .from(entities)
          .where(
            and(
              eq(entities.worldId, row.worldId),
              inArray(entities.id, ids),
              isNull(entities.deletedAt),
              visibleTo(entities.visibility, audience),
            ),
          );
  const portraits = await portraitsFor(
    db,
    row.worldId,
    entryRows.map((entry) => entry.id),
    audience,
  );
  const imageRows = await visibleImagesById(db, row.worldId, imageIds(row.doc), audience);

  const entries: Record<string, BoardEntry> = {};
  for (const entry of entryRows) {
    entries[entry.id] = { ...entry, portraitId: portraits.get(entry.id) ?? null };
  }
  const images: Record<string, BoardImage> = {};
  for (const image of imageRows) images[image.id] = image;

  const doc =
    audience === 'gm'
      ? row.doc
      : boardForPlayers(row.doc, new Set(Object.keys(entries)), new Set(Object.keys(images)));

  return {
    id: row.id,
    name: row.name,
    kind: row.kind as BoardKind,
    shared: row.shared,
    version: row.version,
    doc,
    entries,
    images,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

/** Boards, the latest changed first. Counts and previews are of what the audience may see. */
export async function listBoards(
  db: DbOrTx,
  worldId: string,
  audience: Audience,
): Promise<BoardSummary[]> {
  const rows = await db
    .select()
    .from(boards)
    .where(and(eq(boards.worldId, worldId), boardVisible(audience)))
    .orderBy(desc(boards.updatedAt), desc(boards.id));
  const result: BoardSummary[] = [];
  for (const row of rows) {
    // A player's count must not hint at hidden cards, so their boards are filtered in full.
    const doc = audience === 'gm' ? row.doc : (await toBoard(db, row, audience)).doc;
    result.push({
      id: row.id,
      name: row.name,
      kind: row.kind as BoardKind,
      shared: row.shared,
      itemCount: doc.items.length,
      previewImageIds: imageIds(doc).slice(0, 4),
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    });
  }
  return result;
}

export async function getBoard(
  db: DbOrTx,
  worldId: string,
  id: string,
  audience: Audience,
): Promise<Board> {
  return toBoard(db, await getRow(db, worldId, id, audience), audience);
}

export async function createBoard(
  db: DbOrTx,
  worldId: string,
  userId: string,
  input: z.output<typeof boardCreateSchema> & { doc?: BoardDoc },
): Promise<Board> {
  const [{ total } = { total: 0 }] = await db
    .select({ total: count() })
    .from(boards)
    .where(eq(boards.worldId, worldId));
  if (total >= MAX_BOARDS) {
    throw conflict(`A world holds up to ${MAX_BOARDS} boards. Delete one you no longer need.`);
  }
  const [row] = await db
    .insert(boards)
    .values({
      worldId,
      name: input.name,
      kind: input.kind,
      createdBy: userId,
      ...(input.doc ? { doc: input.doc } : {}),
    })
    .returning();
  return toBoard(db, row!, 'gm');
}

/**
 * Renames, shares or saves a board. Saving the arrangement must name the version it was made on:
 * if someone else has saved since, nothing is written and the editor is told to reload.
 */
export async function updateBoard(
  db: DbOrTx,
  worldId: string,
  id: string,
  input: z.output<typeof boardUpdateSchema>,
): Promise<Board> {
  await getRow(db, worldId, id, 'gm');
  const set: Partial<typeof boards.$inferInsert> = {};
  if (input.name !== undefined) set.name = input.name;
  if (input.shared !== undefined) set.shared = input.shared;
  if (input.doc !== undefined) set.doc = input.doc;
  if (Object.keys(set).length > 0) {
    const [row] = await db
      .update(boards)
      .set(input.doc !== undefined ? { ...set, version: sql`${boards.version} + 1` } : set)
      .where(
        and(
          eq(boards.id, id),
          eq(boards.worldId, worldId),
          input.doc !== undefined ? eq(boards.version, input.baseVersion!) : undefined,
        ),
      )
      .returning();
    if (!row) {
      throw conflict('This board was changed somewhere else. Reload it to carry on.');
    }
  }
  return getBoard(db, worldId, id, 'gm');
}

export async function deleteBoard(db: DbOrTx, worldId: string, id: string): Promise<void> {
  await getRow(db, worldId, id, 'gm');
  await db.delete(boards).where(and(eq(boards.id, id), eq(boards.worldId, worldId)));
}

/** Every board in full, for the world export. */
export async function exportBoards(db: DbOrTx, worldId: string) {
  const rows = await db
    .select()
    .from(boards)
    .where(eq(boards.worldId, worldId))
    .orderBy(boards.createdAt, boards.id);
  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    kind: row.kind as BoardKind,
    shared: row.shared,
    doc: row.doc,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  }));
}
