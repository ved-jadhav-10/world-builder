import type { PlotBoard } from './types';

type Card = PlotBoard['cards'][number];

/** The cards of one cell, in their order. */
export const cardsInCell = (board: PlotBoard, beatId: string, threadId: string): Card[] =>
  board.cards.filter((card) => card.beatId === beatId && card.threadId === threadId);

/**
 * The board after a card is moved to a cell and a place in it, as the server will leave it. It
 * lets the page show a drop at once and then agree with the server's own answer. An index past
 * the end means the end; a card that does not exist leaves the board as it was.
 */
export function moveCardInBoard(
  board: PlotBoard,
  cardId: string,
  to: { beatId: string; threadId: string; index: number },
): PlotBoard {
  const moved = board.cards.find((card) => card.id === cardId);
  if (!moved) return board;
  const others = board.cards.filter((card) => card.id !== cardId);
  const destination = others.filter(
    (card) => card.beatId === to.beatId && card.threadId === to.threadId,
  );
  destination.splice(Math.max(0, Math.min(to.index, destination.length)), 0, {
    ...moved,
    beatId: to.beatId,
    threadId: to.threadId,
  });
  const elsewhere = others.filter(
    (card) => !(card.beatId === to.beatId && card.threadId === to.threadId),
  );
  return { ...board, cards: [...elsewhere, ...destination] };
}
