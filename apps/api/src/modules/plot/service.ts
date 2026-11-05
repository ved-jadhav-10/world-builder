import { and, asc, count, eq, inArray, max } from 'drizzle-orm';
import {
  DEFAULT_THREAD_COLOR,
  DEFAULT_THREAD_NAME,
  MAX_PLOT_BEATS,
  MAX_PLOT_BOARDS,
  MAX_PLOT_CARDS,
  MAX_PLOT_THREADS,
  PLOT_TEMPLATES,
  plotBoardCreateSchema,
  type PlotBeatInput,
  type PlotBoard,
  type PlotBoardCreateInput,
  type PlotBoardSummary,
  type PlotCardCreateInput,
  type PlotCardMoveInput,
  type PlotCardUpdateInput,
  type PlotOrderInput,
  type PlotThreadInput,
} from '@atlas/shared';
import type { Db, DbOrTx } from '../../db/client';
import { manuscriptNodes, plotBeats, plotBoards, plotCards, plotThreads } from '../../db/schema';
import { badRequest, notFound } from '../../errors';

async function boardRow(db: DbOrTx, worldId: string, boardId: string) {
  const [row] = await db
    .select()
    .from(plotBoards)
    .where(and(eq(plotBoards.id, boardId), eq(plotBoards.worldId, worldId)));
  if (!row) throw notFound('Plot board');
  return row;
}

async function touch(db: DbOrTx, boardId: string) {
  await db.update(plotBoards).set({ updatedAt: new Date() }).where(eq(plotBoards.id, boardId));
}

export async function listBoards(db: DbOrTx, worldId: string): Promise<PlotBoardSummary[]> {
  const boards = await db
    .select()
    .from(plotBoards)
    .where(eq(plotBoards.worldId, worldId))
    .orderBy(asc(plotBoards.createdAt), asc(plotBoards.id));
  if (boards.length === 0) return [];
  const ids = boards.map((board) => board.id);
  const tally = async (table: typeof plotBeats | typeof plotThreads | typeof plotCards) => {
    const rows = await db
      .select({ boardId: table.boardId, n: count() })
      .from(table)
      .where(inArray(table.boardId, ids))
      .groupBy(table.boardId);
    return new Map(rows.map((row) => [row.boardId, row.n]));
  };
  const [beats, threads, cards] = await Promise.all([
    tally(plotBeats),
    tally(plotThreads),
    tally(plotCards),
  ]);
  return boards.map((board) => ({
    id: board.id,
    name: board.name,
    templateKey: board.templateKey,
    beatCount: beats.get(board.id) ?? 0,
    threadCount: threads.get(board.id) ?? 0,
    cardCount: cards.get(board.id) ?? 0,
    updatedAt: board.updatedAt.toISOString(),
  }));
}

export async function getBoard(db: DbOrTx, worldId: string, boardId: string): Promise<PlotBoard> {
  const board = await boardRow(db, worldId, boardId);
  const [beats, threads, cards] = await Promise.all([
    db
      .select({ id: plotBeats.id, title: plotBeats.title, description: plotBeats.description })
      .from(plotBeats)
      .where(eq(plotBeats.boardId, boardId))
      .orderBy(asc(plotBeats.sortOrder), asc(plotBeats.id)),
    db
      .select({ id: plotThreads.id, name: plotThreads.name, color: plotThreads.color })
      .from(plotThreads)
      .where(eq(plotThreads.boardId, boardId))
      .orderBy(asc(plotThreads.sortOrder), asc(plotThreads.id)),
    db
      .select({
        id: plotCards.id,
        beatId: plotCards.beatId,
        threadId: plotCards.threadId,
        title: plotCards.title,
        text: plotCards.text,
        sceneId: plotCards.sceneId,
        color: plotCards.color,
      })
      .from(plotCards)
      .where(eq(plotCards.boardId, boardId))
      .orderBy(asc(plotCards.sortOrder), asc(plotCards.createdAt), asc(plotCards.id)),
  ]);
  return {
    id: board.id,
    name: board.name,
    templateKey: board.templateKey,
    beats,
    threads,
    cards,
    updatedAt: board.updatedAt.toISOString(),
  };
}

/** Every board with its beats, rows and cards, for the exports. */
export async function listAllBoards(db: DbOrTx, worldId: string): Promise<PlotBoard[]> {
  const boards = await listBoards(db, worldId);
  return Promise.all(boards.map((board) => getBoard(db, worldId, board.id)));
}

export async function createBoard(
  db: Db,
  worldId: string,
  input: PlotBoardCreateInput,
): Promise<PlotBoard> {
  const data = plotBoardCreateSchema.parse(input);
  const [boards] = await db
    .select({ n: count() })
    .from(plotBoards)
    .where(eq(plotBoards.worldId, worldId));
  if ((boards?.n ?? 0) >= MAX_PLOT_BOARDS) {
    throw badRequest(`A world can have at most ${MAX_PLOT_BOARDS} plot boards`);
  }
  const template = PLOT_TEMPLATES[data.template];
  const id = await db.transaction(async (tx) => {
    const [board] = await tx
      .insert(plotBoards)
      .values({ worldId, name: data.name, templateKey: data.template })
      .returning({ id: plotBoards.id });
    await tx.insert(plotBeats).values(
      template.beats.map((beat, index) => ({
        boardId: board!.id,
        title: beat.title,
        description: beat.description,
        sortOrder: index,
      })),
    );
    await tx.insert(plotThreads).values({
      boardId: board!.id,
      name: DEFAULT_THREAD_NAME,
      color: DEFAULT_THREAD_COLOR,
      sortOrder: 0,
    });
    return board!.id;
  });
  return getBoard(db, worldId, id);
}

export async function renameBoard(
  db: DbOrTx,
  worldId: string,
  boardId: string,
  name: string,
): Promise<PlotBoard> {
  await boardRow(db, worldId, boardId);
  await db
    .update(plotBoards)
    .set({ name, updatedAt: new Date() })
    .where(eq(plotBoards.id, boardId));
  return getBoard(db, worldId, boardId);
}

export async function deleteBoard(db: DbOrTx, worldId: string, boardId: string): Promise<void> {
  const deleted = await db
    .delete(plotBoards)
    .where(and(eq(plotBoards.id, boardId), eq(plotBoards.worldId, worldId)))
    .returning({ id: plotBoards.id });
  if (deleted.length === 0) throw notFound('Plot board');
}

// ---- Beats and storylines ------------------------------------------------------------------------

async function nextOrder(
  db: DbOrTx,
  table: typeof plotBeats | typeof plotThreads,
  boardId: string,
): Promise<{ next: number; total: number }> {
  const [row] = await db
    .select({ top: max(table.sortOrder), n: count() })
    .from(table)
    .where(eq(table.boardId, boardId));
  return { next: (row?.top ?? -1) + 1, total: row?.n ?? 0 };
}

export async function addBeat(
  db: DbOrTx,
  worldId: string,
  boardId: string,
  input: PlotBeatInput,
): Promise<PlotBoard> {
  await boardRow(db, worldId, boardId);
  const { next, total } = await nextOrder(db, plotBeats, boardId);
  if (total >= MAX_PLOT_BEATS) throw badRequest(`A board can have at most ${MAX_PLOT_BEATS} beats`);
  await db.insert(plotBeats).values({
    boardId,
    title: input.title,
    description: input.description ?? '',
    sortOrder: next,
  });
  await touch(db, boardId);
  return getBoard(db, worldId, boardId);
}

export async function updateBeat(
  db: DbOrTx,
  worldId: string,
  boardId: string,
  beatId: string,
  input: Partial<PlotBeatInput>,
): Promise<PlotBoard> {
  await boardRow(db, worldId, boardId);
  const updated = await db
    .update(plotBeats)
    .set(input)
    .where(and(eq(plotBeats.id, beatId), eq(plotBeats.boardId, boardId)))
    .returning({ id: plotBeats.id });
  if (updated.length === 0) throw notFound('Beat');
  await touch(db, boardId);
  return getBoard(db, worldId, boardId);
}

/** Removes a beat and the cards in it. A board always keeps at least one. */
export async function deleteBeat(
  db: DbOrTx,
  worldId: string,
  boardId: string,
  beatId: string,
): Promise<PlotBoard> {
  await boardRow(db, worldId, boardId);
  const [existing] = await db
    .select({ id: plotBeats.id })
    .from(plotBeats)
    .where(and(eq(plotBeats.id, beatId), eq(plotBeats.boardId, boardId)));
  if (!existing) throw notFound('Beat');
  const { total } = await nextOrder(db, plotBeats, boardId);
  if (total <= 1) throw badRequest('A board needs at least one beat');
  const deleted = await db
    .delete(plotBeats)
    .where(and(eq(plotBeats.id, beatId), eq(plotBeats.boardId, boardId)))
    .returning({ id: plotBeats.id });
  if (deleted.length === 0) throw notFound('Beat');
  await touch(db, boardId);
  return getBoard(db, worldId, boardId);
}

export async function addThread(
  db: DbOrTx,
  worldId: string,
  boardId: string,
  input: PlotThreadInput,
): Promise<PlotBoard> {
  await boardRow(db, worldId, boardId);
  const { next, total } = await nextOrder(db, plotThreads, boardId);
  if (total >= MAX_PLOT_THREADS) {
    throw badRequest(`A board can have at most ${MAX_PLOT_THREADS} storylines`);
  }
  await db.insert(plotThreads).values({
    boardId,
    name: input.name,
    color: input.color ?? DEFAULT_THREAD_COLOR,
    sortOrder: next,
  });
  await touch(db, boardId);
  return getBoard(db, worldId, boardId);
}

export async function updateThread(
  db: DbOrTx,
  worldId: string,
  boardId: string,
  threadId: string,
  input: Partial<PlotThreadInput>,
): Promise<PlotBoard> {
  await boardRow(db, worldId, boardId);
  const updated = await db
    .update(plotThreads)
    .set(input)
    .where(and(eq(plotThreads.id, threadId), eq(plotThreads.boardId, boardId)))
    .returning({ id: plotThreads.id });
  if (updated.length === 0) throw notFound('Storyline');
  await touch(db, boardId);
  return getBoard(db, worldId, boardId);
}

/** Removes a storyline and the cards in it. A board always keeps at least one. */
export async function deleteThread(
  db: DbOrTx,
  worldId: string,
  boardId: string,
  threadId: string,
): Promise<PlotBoard> {
  await boardRow(db, worldId, boardId);
  const [existing] = await db
    .select({ id: plotThreads.id })
    .from(plotThreads)
    .where(and(eq(plotThreads.id, threadId), eq(plotThreads.boardId, boardId)));
  if (!existing) throw notFound('Storyline');
  const { total } = await nextOrder(db, plotThreads, boardId);
  if (total <= 1) throw badRequest('A board needs at least one storyline');
  const deleted = await db
    .delete(plotThreads)
    .where(and(eq(plotThreads.id, threadId), eq(plotThreads.boardId, boardId)))
    .returning({ id: plotThreads.id });
  if (deleted.length === 0) throw notFound('Storyline');
  await touch(db, boardId);
  return getBoard(db, worldId, boardId);
}

/** Puts the columns and/or rows in a new order. Each list must name every one, once. */
export async function reorder(
  db: Db,
  worldId: string,
  boardId: string,
  input: PlotOrderInput,
): Promise<PlotBoard> {
  await boardRow(db, worldId, boardId);
  await db.transaction(async (tx) => {
    const apply = async (
      table: typeof plotBeats | typeof plotThreads,
      ids: readonly string[] | undefined,
      what: string,
    ) => {
      if (!ids) return;
      const existing = await tx
        .select({ id: table.id })
        .from(table)
        .where(eq(table.boardId, boardId));
      const same =
        ids.length === existing.length &&
        new Set(ids).size === ids.length &&
        existing.every((row) => ids.includes(row.id));
      if (!same) throw badRequest(`List every ${what} of the board exactly once`);
      for (const [index, id] of ids.entries()) {
        await tx.update(table).set({ sortOrder: index }).where(eq(table.id, id));
      }
    };
    await apply(plotBeats, input.beatIds, 'beat');
    await apply(plotThreads, input.threadIds, 'storyline');
    await touch(tx, boardId);
  });
  return getBoard(db, worldId, boardId);
}

// ---- Cards -------------------------------------------------------------------------------------

async function requireCell(db: DbOrTx, boardId: string, beatId: string, threadId: string) {
  const [beat] = await db
    .select({ id: plotBeats.id })
    .from(plotBeats)
    .where(and(eq(plotBeats.id, beatId), eq(plotBeats.boardId, boardId)));
  if (!beat) throw badRequest('That beat is not on this board');
  const [thread] = await db
    .select({ id: plotThreads.id })
    .from(plotThreads)
    .where(and(eq(plotThreads.id, threadId), eq(plotThreads.boardId, boardId)));
  if (!thread) throw badRequest('That storyline is not on this board');
}

async function requireScene(db: DbOrTx, worldId: string, sceneId: string) {
  const [scene] = await db
    .select({ id: manuscriptNodes.id })
    .from(manuscriptNodes)
    .where(
      and(
        eq(manuscriptNodes.id, sceneId),
        eq(manuscriptNodes.worldId, worldId),
        eq(manuscriptNodes.kind, 'scene'),
      ),
    );
  if (!scene) throw badRequest('That scene does not exist');
}

const cellOf = (beatId: string, threadId: string) =>
  and(eq(plotCards.beatId, beatId), eq(plotCards.threadId, threadId));

export async function addCard(
  db: Db,
  worldId: string,
  boardId: string,
  input: Required<Pick<PlotCardCreateInput, 'beatId' | 'threadId' | 'title'>> & PlotCardCreateInput,
): Promise<PlotBoard> {
  await boardRow(db, worldId, boardId);
  await requireCell(db, boardId, input.beatId, input.threadId);
  if (input.sceneId) await requireScene(db, worldId, input.sceneId);
  await db.transaction(async (tx) => {
    const [all] = await tx
      .select({ total: count() })
      .from(plotCards)
      .where(eq(plotCards.boardId, boardId));
    if ((all?.total ?? 0) >= MAX_PLOT_CARDS) {
      throw badRequest(`A board can have at most ${MAX_PLOT_CARDS} cards`);
    }
    const [cell] = await tx
      .select({ inCell: count() })
      .from(plotCards)
      .where(and(eq(plotCards.boardId, boardId), cellOf(input.beatId, input.threadId)));
    await tx.insert(plotCards).values({
      boardId,
      beatId: input.beatId,
      threadId: input.threadId,
      title: input.title,
      text: input.text ?? '',
      sceneId: input.sceneId ?? null,
      color: input.color ?? null,
      sortOrder: cell?.inCell ?? 0,
    });
    await touch(tx, boardId);
  });
  return getBoard(db, worldId, boardId);
}

export async function updateCard(
  db: DbOrTx,
  worldId: string,
  boardId: string,
  cardId: string,
  input: PlotCardUpdateInput,
): Promise<PlotBoard> {
  await boardRow(db, worldId, boardId);
  if (input.sceneId) await requireScene(db, worldId, input.sceneId);
  const updated = await db
    .update(plotCards)
    .set({ ...input, updatedAt: new Date() })
    .where(and(eq(plotCards.id, cardId), eq(plotCards.boardId, boardId)))
    .returning({ id: plotCards.id });
  if (updated.length === 0) throw notFound('Card');
  await touch(db, boardId);
  return getBoard(db, worldId, boardId);
}

/** Moves a card to a cell and a place in it, and closes the gap it left behind. */
export async function moveCard(
  db: Db,
  worldId: string,
  boardId: string,
  cardId: string,
  input: PlotCardMoveInput,
): Promise<PlotBoard> {
  await boardRow(db, worldId, boardId);
  await requireCell(db, boardId, input.beatId, input.threadId);
  await db.transaction(async (tx) => {
    // Two moves at once would otherwise each renumber from a stale view of the cell.
    await tx
      .select({ id: plotBoards.id })
      .from(plotBoards)
      .where(eq(plotBoards.id, boardId))
      .for('update');
    const [card] = await tx
      .select()
      .from(plotCards)
      .where(and(eq(plotCards.id, cardId), eq(plotCards.boardId, boardId)));
    if (!card) throw notFound('Card');

    const inCell = (beatId: string, threadId: string) =>
      tx
        .select({ id: plotCards.id })
        .from(plotCards)
        .where(and(eq(plotCards.boardId, boardId), cellOf(beatId, threadId)))
        .orderBy(asc(plotCards.sortOrder), asc(plotCards.createdAt), asc(plotCards.id))
        .then((rows) => rows.map((row) => row.id).filter((id) => id !== cardId));

    const destination = await inCell(input.beatId, input.threadId);
    destination.splice(Math.min(input.index, destination.length), 0, cardId);
    await tx
      .update(plotCards)
      .set({ beatId: input.beatId, threadId: input.threadId, updatedAt: new Date() })
      .where(eq(plotCards.id, cardId));
    for (const [index, id] of destination.entries()) {
      await tx.update(plotCards).set({ sortOrder: index }).where(eq(plotCards.id, id));
    }
    if (card.beatId !== input.beatId || card.threadId !== input.threadId) {
      const source = await inCell(card.beatId, card.threadId);
      for (const [index, id] of source.entries()) {
        await tx.update(plotCards).set({ sortOrder: index }).where(eq(plotCards.id, id));
      }
    }
    await touch(tx, boardId);
  });
  return getBoard(db, worldId, boardId);
}

export async function deleteCard(
  db: Db,
  worldId: string,
  boardId: string,
  cardId: string,
): Promise<PlotBoard> {
  await boardRow(db, worldId, boardId);
  await db.transaction(async (tx) => {
    const [card] = await tx
      .delete(plotCards)
      .where(and(eq(plotCards.id, cardId), eq(plotCards.boardId, boardId)))
      .returning();
    if (!card) throw notFound('Card');
    const rest = await tx
      .select({ id: plotCards.id })
      .from(plotCards)
      .where(and(eq(plotCards.boardId, boardId), cellOf(card.beatId, card.threadId)))
      .orderBy(asc(plotCards.sortOrder), asc(plotCards.createdAt), asc(plotCards.id));
    for (const [index, row] of rest.entries()) {
      await tx.update(plotCards).set({ sortOrder: index }).where(eq(plotCards.id, row.id));
    }
    await touch(tx, boardId);
  });
  return getBoard(db, worldId, boardId);
}
