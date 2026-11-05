import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  moveCardInBoard,
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
import { api } from './client';

export const plotKeys = {
  list: (worldId: string) => ['plot', worldId] as const,
  board: (worldId: string, boardId: string) => ['plot', worldId, boardId] as const,
};

export const usePlotBoards = (worldId: string) =>
  useQuery({
    queryKey: plotKeys.list(worldId),
    queryFn: () => api<PlotBoardSummary[]>('GET', `/worlds/${worldId}/plot`),
  });

export const usePlotBoard = (worldId: string, boardId: string) =>
  useQuery({
    queryKey: plotKeys.board(worldId, boardId),
    queryFn: () => api<PlotBoard>('GET', `/worlds/${worldId}/plot/${boardId}`),
  });

export function useCreatePlotBoard(worldId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: PlotBoardCreateInput) =>
      api<PlotBoard>('POST', `/worlds/${worldId}/plot`, input),
    onSuccess: (board) => {
      qc.setQueryData(plotKeys.board(worldId, board.id), board);
      void qc.invalidateQueries({ queryKey: plotKeys.list(worldId), exact: true });
    },
  });
}

export function useDeletePlotBoard(worldId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (boardId: string) => api<void>('DELETE', `/worlds/${worldId}/plot/${boardId}`),
    // Only the list: the page of the deleted board is still showing until the caller leaves it.
    onSuccess: () => void qc.invalidateQueries({ queryKey: plotKeys.list(worldId), exact: true }),
  });
}

/**
 * Everything that changes one board. Each call answers with the whole board, which replaces what
 * the page has, so the page always shows what the server numbered. A card move also applies at
 * once and goes back if the server refuses.
 */
export function usePlotActions(worldId: string, boardId: string) {
  const qc = useQueryClient();
  const key = plotKeys.board(worldId, boardId);
  const base = `/worlds/${worldId}/plot/${boardId}`;
  const keep = (board: PlotBoard) => {
    qc.setQueryData(key, board);
    void qc.invalidateQueries({ queryKey: plotKeys.list(worldId), exact: true });
  };
  const useCall = <TInput>(
    method: 'POST' | 'PATCH' | 'PUT' | 'DELETE',
    path: (input: TInput) => string,
    body?: (input: TInput) => unknown,
  ) =>
    useMutation({
      mutationFn: (input: TInput) => api<PlotBoard>(method, `${base}${path(input)}`, body?.(input)),
      onSuccess: keep,
    });

  return {
    rename: useCall<{ name: string }>(
      'PATCH',
      () => '',
      (i) => i,
    ),
    addBeat: useCall<PlotBeatInput>(
      'POST',
      () => '/beats',
      (i) => i,
    ),
    updateBeat: useCall<{ id: string; title?: string; description?: string }>(
      'PATCH',
      (i) => `/beats/${i.id}`,
      ({ id: _id, ...rest }) => rest,
    ),
    deleteBeat: useCall<string>('DELETE', (id) => `/beats/${id}`),
    addThread: useCall<PlotThreadInput>(
      'POST',
      () => '/threads',
      (i) => i,
    ),
    updateThread: useCall<{ id: string; name?: string; color?: string }>(
      'PATCH',
      (i) => `/threads/${i.id}`,
      ({ id: _id, ...rest }) => rest,
    ),
    deleteThread: useCall<string>('DELETE', (id) => `/threads/${id}`),
    reorder: useCall<PlotOrderInput>(
      'PUT',
      () => '/order',
      (i) => i,
    ),
    addCard: useCall<PlotCardCreateInput>(
      'POST',
      () => '/cards',
      (i) => i,
    ),
    updateCard: useCall<{ id: string } & PlotCardUpdateInput>(
      'PATCH',
      (i) => `/cards/${i.id}`,
      ({ id: _id, ...rest }) => rest,
    ),
    deleteCard: useCall<string>('DELETE', (id) => `/cards/${id}`),
    moveCard: useMutation({
      mutationFn: ({ id, ...to }: { id: string } & PlotCardMoveInput) =>
        api<PlotBoard>('POST', `${base}/cards/${id}/move`, to),
      onMutate: async ({ id, ...to }) => {
        await qc.cancelQueries({ queryKey: key });
        const previous = qc.getQueryData<PlotBoard>(key);
        if (previous) qc.setQueryData(key, moveCardInBoard(previous, id, to));
        return { previous };
      },
      onError: (_error, _input, context) => {
        if (context?.previous) qc.setQueryData(key, context.previous);
      },
      onSuccess: keep,
    }),
  };
}
