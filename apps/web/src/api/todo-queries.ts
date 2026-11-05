import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { Todo, TodoCreateInput, TodoUpdateInput } from '@atlas/shared';
import { api } from './client';

export const todoKey = (worldId: string) => ['todos', worldId] as const;

export const useTodos = (worldId: string, enabled = true) =>
  useQuery({
    queryKey: todoKey(worldId),
    queryFn: () => api<Todo[]>('GET', `/worlds/${worldId}/todos`),
    enabled,
  });

export function useCreateTodo(worldId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: TodoCreateInput) => api<Todo>('POST', `/worlds/${worldId}/todos`, input),
    onSuccess: () => qc.invalidateQueries({ queryKey: todoKey(worldId) }),
  });
}

export function useUpdateTodo(worldId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...input }: TodoUpdateInput & { id: string }) =>
      api<Todo>('PATCH', `/worlds/${worldId}/todos/${id}`, input),
    onSuccess: () => qc.invalidateQueries({ queryKey: todoKey(worldId) }),
  });
}

export function useDeleteTodo(worldId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api<void>('DELETE', `/worlds/${worldId}/todos/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: todoKey(worldId) }),
  });
}

export function useClearDoneTodos(worldId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api<{ removed: number }>('POST', `/worlds/${worldId}/todos/clear-done`),
    onSuccess: () => qc.invalidateQueries({ queryKey: todoKey(worldId) }),
  });
}
