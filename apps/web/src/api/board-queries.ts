import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { Board, BoardCreateInput, BoardSummary, BoardUpdateInput } from '@atlas/shared';
import { api } from './client';

const listKey = (worldId: string) => ['boards', worldId] as const;
const boardKey = (worldId: string, id: string) => ['boards', worldId, id] as const;

export const useBoards = (worldId: string) =>
  useQuery({
    queryKey: listKey(worldId),
    queryFn: () => api<BoardSummary[]>('GET', `/worlds/${worldId}/boards`),
  });

export const useBoard = (worldId: string, id: string) =>
  useQuery({
    queryKey: boardKey(worldId, id),
    queryFn: () => api<Board>('GET', `/worlds/${worldId}/boards/${id}`),
    // The editor holds the board while it is open; a refetch must not replace work in progress.
    staleTime: Infinity,
    gcTime: 0,
    refetchOnWindowFocus: false,
    retry: false,
  });

export function useCreateBoard(worldId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: BoardCreateInput) => api<Board>('POST', `/worlds/${worldId}/boards`, input),
    onSuccess: () => qc.invalidateQueries({ queryKey: listKey(worldId), exact: true }),
  });
}

/** Saves a board. The caller keeps the returned version for its next save. */
export const saveBoard = (worldId: string, id: string, input: BoardUpdateInput) =>
  api<Board>('PATCH', `/worlds/${worldId}/boards/${id}`, input);

export function useDeleteBoard(worldId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api<void>('DELETE', `/worlds/${worldId}/boards/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: listKey(worldId), exact: true }),
  });
}

export const useRefreshBoardList = (worldId: string) => {
  const qc = useQueryClient();
  return () => qc.invalidateQueries({ queryKey: listKey(worldId), exact: true });
};
