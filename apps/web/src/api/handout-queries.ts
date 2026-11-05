import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { Handout, HandoutCreateInput, HandoutUpdateInput } from '@atlas/shared';
import { api, apiUpload } from './client';

export const handoutKey = (worldId: string) => ['handouts', worldId] as const;

/** A handout's picture; the version in the address makes a replaced picture show up. */
export const handoutImageUrl = (worldId: string, handout: Handout, thumbnail = false) =>
  `/api/worlds/${worldId}/handouts/${handout.id}/${thumbnail ? 'thumbnail' : 'image'}?v=${handout.imageVersion}`;

/**
 * The handouts this person can see. With `poll`, the list is asked for again every few seconds
 * while the tab is open, which is how a reveal reaches players without anyone reloading.
 */
export const useHandouts = (worldId: string, options: { poll?: number; enabled?: boolean } = {}) =>
  useQuery({
    queryKey: handoutKey(worldId),
    queryFn: () => api<Handout[]>('GET', `/worlds/${worldId}/handouts`),
    enabled: options.enabled ?? true,
    refetchInterval: options.poll ?? false,
    refetchIntervalInBackground: false,
  });

export function useCreateHandout(worldId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: HandoutCreateInput) =>
      api<Handout>('POST', `/worlds/${worldId}/handouts`, input),
    onSuccess: () => qc.invalidateQueries({ queryKey: handoutKey(worldId) }),
  });
}

export function useUpdateHandout(worldId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...input }: HandoutUpdateInput & { id: string }) =>
      api<Handout>('PATCH', `/worlds/${worldId}/handouts/${id}`, input),
    onSuccess: () => qc.invalidateQueries({ queryKey: handoutKey(worldId) }),
  });
}

export function useDeleteHandout(worldId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api<void>('DELETE', `/worlds/${worldId}/handouts/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: handoutKey(worldId) }),
  });
}

export function useUploadHandoutImage(worldId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, image }: { id: string; image: File }) => {
      const form = new FormData();
      form.set('image', image);
      return apiUpload<Handout>(`/worlds/${worldId}/handouts/${id}/image`, form);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: handoutKey(worldId) }),
  });
}

export function useRemoveHandoutImage(worldId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api<Handout>('DELETE', `/worlds/${worldId}/handouts/${id}/image`),
    onSuccess: () => qc.invalidateQueries({ queryKey: handoutKey(worldId) }),
  });
}
