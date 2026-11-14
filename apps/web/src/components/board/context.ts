import type { Node } from '@xyflow/react';
import { createContext, useContext } from 'react';
import type { BoardEntry, BoardImage, BoardItem, EntityType } from '@atlas/shared';

export type BoardNode = Node<{ item: BoardItem }>;

export interface BoardContextValue {
  worldId: string;
  base: string;
  editable: boolean;
  /** Whether the board is shown to players, so cards can say which of them players will miss. */
  shared: boolean;
  entries: Record<string, BoardEntry>;
  images: Record<string, BoardImage>;
  typeById: Map<string, EntityType>;
  update: (id: string, patch: Partial<BoardItem>) => void;
  remove: (id: string) => void;
  duplicate: (id: string) => void;
  pullColours: (id: string) => void;
}

export const BoardContext = createContext<BoardContextValue | null>(null);

export function useBoardContext(): BoardContextValue {
  const value = useContext(BoardContext);
  if (!value) throw new Error('Board items must be drawn inside a board');
  return value;
}
