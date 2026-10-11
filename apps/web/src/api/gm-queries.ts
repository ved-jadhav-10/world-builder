import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  Entity,
  GalleryImage,
  ImageListQuery,
  ImageUpdateInput,
  QuestSummary,
  Visibility,
} from '@atlas/shared';
import { api, apiUpload } from './client';

export const gmKeys = {
  quests: (worldId: string) => ['quests', worldId] as const,
  images: (worldId: string, filter: ImageListQuery = {}) => ['images', worldId, filter] as const,
};

/** Where an image's file lives. Images never change once stored, so the browser may keep them. */
export const imageUrl = (worldId: string, imageId: string, size: 'file' | 'thumbnail' = 'file') =>
  `/api/worlds/${worldId}/images/${imageId}/${size}`;

// ---- Quests ---------------------------------------------------------------------------------

export const useQuests = (worldId: string) =>
  useQuery({
    queryKey: gmKeys.quests(worldId),
    queryFn: () => api<QuestSummary[]>('GET', `/worlds/${worldId}/quests`),
  });

export function useSetQuestStatus(worldId: string) {
  const qc = useQueryClient();
  const key = gmKeys.quests(worldId);
  return useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) =>
      api<Entity>('PATCH', `/worlds/${worldId}/quests/${id}/status`, { status }),
    // The card moves at once; it jumps back if the server refuses.
    onMutate: async ({ id, status }) => {
      await qc.cancelQueries({ queryKey: key });
      const previous = qc.getQueryData<QuestSummary[]>(key);
      qc.setQueryData<QuestSummary[]>(key, (list) =>
        list?.map((quest) => (quest.id === id ? { ...quest, status } : quest)),
      );
      return { previous };
    },
    onError: (_error, _input, context) => {
      if (context?.previous) qc.setQueryData(key, context.previous);
    },
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: key });
      void qc.invalidateQueries({ queryKey: ['entities', worldId] });
    },
  });
}

// ---- Gallery ----------------------------------------------------------------------------------

export const useImages = (worldId: string, filter: ImageListQuery = {}) =>
  useQuery({
    queryKey: gmKeys.images(worldId, filter),
    queryFn: () => {
      const params = new URLSearchParams();
      if (filter.entityId) params.set('entityId', filter.entityId);
      if (filter.scope) params.set('scope', filter.scope);
      const query = params.size ? `?${params}` : '';
      return api<GalleryImage[]>('GET', `/worlds/${worldId}/images${query}`);
    },
  });

const invalidateImages = (qc: ReturnType<typeof useQueryClient>, worldId: string) =>
  qc.invalidateQueries({ queryKey: ['images', worldId] });

export function useUploadImage(worldId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: {
      image: File;
      entityId?: string | null;
      caption?: string;
      visibility?: Visibility;
      portrait?: boolean;
    }) => {
      const form = new FormData();
      form.set('entityId', input.entityId ?? '');
      form.set('caption', input.caption ?? '');
      form.set('visibility', input.visibility ?? 'gm');
      form.set('portrait', input.portrait ? 'true' : 'false');
      form.set('image', input.image);
      return apiUpload<GalleryImage>(`/worlds/${worldId}/images`, form);
    },
    onSuccess: () => invalidateImages(qc, worldId),
  });
}

export function useUpdateImage(worldId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...input }: ImageUpdateInput & { id: string }) =>
      api<GalleryImage>('PATCH', `/worlds/${worldId}/images/${id}`, input),
    onSuccess: () => invalidateImages(qc, worldId),
  });
}

export function useDeleteImage(worldId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api<void>('DELETE', `/worlds/${worldId}/images/${id}`),
    onSuccess: () => invalidateImages(qc, worldId),
  });
}
