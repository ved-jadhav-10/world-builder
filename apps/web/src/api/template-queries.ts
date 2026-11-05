import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  EntryTemplate,
  EntryTemplateCreateInput,
  SavedFilter,
  SavedFilterCreateInput,
} from '@atlas/shared';
import { api } from './client';

export const templateKey = (worldId: string) => ['templates', worldId] as const;
export const savedFilterKey = (worldId: string) => ['saved-filters', worldId] as const;

/** Entry templates for one type; only asked for when `enabled`, since only editors can read them. */
export const useTemplates = (worldId: string, typeId: string | undefined, enabled: boolean) =>
  useQuery({
    queryKey: [...templateKey(worldId), typeId ?? 'all'],
    queryFn: () =>
      api<EntryTemplate[]>(
        'GET',
        `/worlds/${worldId}/templates${typeId ? `?typeId=${typeId}` : ''}`,
      ),
    enabled: enabled && Boolean(typeId),
  });

export function useCreateTemplate(worldId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: EntryTemplateCreateInput) =>
      api<EntryTemplate>('POST', `/worlds/${worldId}/templates`, input),
    onSuccess: () => qc.invalidateQueries({ queryKey: templateKey(worldId) }),
  });
}

export function useDeleteTemplate(worldId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api<void>('DELETE', `/worlds/${worldId}/templates/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: templateKey(worldId) }),
  });
}

export const useSavedFilters = (worldId: string, typeId: string | undefined) =>
  useQuery({
    queryKey: [...savedFilterKey(worldId), typeId ?? 'all'],
    queryFn: () => api<SavedFilter[]>('GET', `/worlds/${worldId}/saved-filters?typeId=${typeId}`),
    enabled: Boolean(typeId),
  });

export function useCreateSavedFilter(worldId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: SavedFilterCreateInput) =>
      api<SavedFilter>('POST', `/worlds/${worldId}/saved-filters`, input),
    onSuccess: () => qc.invalidateQueries({ queryKey: savedFilterKey(worldId) }),
  });
}

export function useDeleteSavedFilter(worldId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api<void>('DELETE', `/worlds/${worldId}/saved-filters/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: savedFilterKey(worldId) }),
  });
}
