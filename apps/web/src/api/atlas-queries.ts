import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  AtlasMap,
  AtlasSearchResult,
  EntityMapLink,
  FeatureCreateInput,
  FeatureUpdateInput,
  MapFeature,
  MapUpdateInput,
  Visibility,
} from '@atlas/shared';
import { api, apiUpload } from './client';

export const atlasKeys = {
  maps: (worldId: string) => ['maps', worldId] as const,
  map: (worldId: string, id: string) => ['maps', worldId, 'one', id] as const,
  features: (worldId: string, mapId: string) => ['map-features', worldId, mapId] as const,
  entityMaps: (worldId: string, entityId: string) => ['entity-maps', worldId, entityId] as const,
  search: (worldId: string, q: string) => ['atlas-search', worldId, q] as const,
};

/** URL template Leaflet fills in for each tile. */
export const tileUrlTemplate = (worldId: string, mapId: string) =>
  `/api/worlds/${worldId}/maps/${mapId}/tiles/{z}/{x}/{y}`;
export const thumbnailUrl = (worldId: string, mapId: string) =>
  `/api/worlds/${worldId}/maps/${mapId}/thumbnail`;

/** Maps are cut into tiles in the background, so poll while any are still being prepared. */
const POLL_MS = 2500;

export const useMaps = (worldId: string) =>
  useQuery({
    queryKey: atlasKeys.maps(worldId),
    queryFn: () => api<AtlasMap[]>('GET', `/worlds/${worldId}/maps`),
    refetchInterval: (query) =>
      query.state.data?.some((m) => m.status === 'processing') ? POLL_MS : false,
  });

export const useMap = (worldId: string, mapId: string) =>
  useQuery({
    queryKey: atlasKeys.map(worldId, mapId),
    queryFn: () => api<AtlasMap>('GET', `/worlds/${worldId}/maps/${mapId}`),
    refetchInterval: (query) => (query.state.data?.status === 'processing' ? POLL_MS : false),
  });

export const useMapFeatures = (worldId: string, mapId: string, enabled = true) =>
  useQuery({
    queryKey: atlasKeys.features(worldId, mapId),
    queryFn: () => api<MapFeature[]>('GET', `/worlds/${worldId}/maps/${mapId}/features`),
    enabled,
  });

export const useEntityMaps = (worldId: string, entityId: string) =>
  useQuery({
    queryKey: atlasKeys.entityMaps(worldId, entityId),
    queryFn: () => api<EntityMapLink[]>('GET', `/worlds/${worldId}/entities/${entityId}/maps`),
  });

export const useAtlasSearch = (worldId: string, q: string) =>
  useQuery({
    queryKey: atlasKeys.search(worldId, q),
    queryFn: () =>
      api<AtlasSearchResult[]>(
        'GET',
        `/worlds/${worldId}/atlas/search?q=${encodeURIComponent(q)}&limit=8`,
      ),
    enabled: q.length > 0,
  });

/** Anything that changes what maps or their features say about entries. */
function invalidateAtlas(qc: ReturnType<typeof useQueryClient>, worldId: string) {
  void qc.invalidateQueries({ queryKey: ['maps', worldId] });
  void qc.invalidateQueries({ queryKey: ['entity-maps', worldId] });
  void qc.invalidateQueries({ queryKey: ['atlas-search', worldId] });
}

export function useUploadMap(worldId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: {
      image: File;
      name: string;
      description?: string;
      parentId?: string | null;
      entityId?: string | null;
      visibility?: Visibility;
    }) => {
      const form = new FormData();
      form.set('name', input.name);
      form.set('description', input.description ?? '');
      form.set('parentId', input.parentId ?? '');
      form.set('entityId', input.entityId ?? '');
      form.set('visibility', input.visibility ?? 'gm');
      form.set('image', input.image);
      return apiUpload<AtlasMap>(`/worlds/${worldId}/maps`, form);
    },
    onSuccess: () => invalidateAtlas(qc, worldId),
  });
}

export function useUpdateMap(worldId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...input }: MapUpdateInput & { id: string }) =>
      api<AtlasMap>('PATCH', `/worlds/${worldId}/maps/${id}`, input),
    onSuccess: (map) => {
      qc.setQueryData(atlasKeys.map(worldId, map.id), map);
      invalidateAtlas(qc, worldId);
    },
  });
}

export function useDeleteMap(worldId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api<void>('DELETE', `/worlds/${worldId}/maps/${id}`),
    onSuccess: (_void, id) => {
      // Refresh the lists, but not the deleted map itself: refetching it would only 404.
      void qc.invalidateQueries({
        queryKey: ['maps', worldId],
        predicate: (query) => query.queryKey[3] !== id,
      });
      void qc.invalidateQueries({ queryKey: ['entity-maps', worldId] });
      void qc.invalidateQueries({ queryKey: ['atlas-search', worldId] });
    },
  });
}

export function useRetryMap(worldId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api<AtlasMap>('POST', `/worlds/${worldId}/maps/${id}/retry`),
    onSuccess: (map) => {
      qc.setQueryData(atlasKeys.map(worldId, map.id), map);
      invalidateAtlas(qc, worldId);
    },
  });
}

export function useCreateFeature(worldId: string, mapId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: FeatureCreateInput) =>
      api<MapFeature>('POST', `/worlds/${worldId}/maps/${mapId}/features`, input),
    onSuccess: (feature) => {
      qc.setQueryData<MapFeature[]>(atlasKeys.features(worldId, mapId), (list) =>
        list ? [...list, feature] : [feature],
      );
      invalidateAtlas(qc, worldId);
    },
  });
}

export function useUpdateFeature(worldId: string, mapId: string) {
  const qc = useQueryClient();
  const key = atlasKeys.features(worldId, mapId);
  return useMutation({
    mutationFn: ({ id, ...input }: FeatureUpdateInput & { id: string }) =>
      api<MapFeature>('PATCH', `/worlds/${worldId}/maps/${mapId}/features/${id}`, input),
    // Dragging a pin shouldn't snap back while the request is in flight.
    onMutate: async ({ id, points }) => {
      if (!points) return undefined;
      await qc.cancelQueries({ queryKey: key });
      const previous = qc.getQueryData<MapFeature[]>(key);
      qc.setQueryData<MapFeature[]>(key, (list) =>
        list?.map((f) => (f.id === id ? { ...f, points } : f)),
      );
      return { previous };
    },
    onError: (_error, _input, context) => {
      if (context?.previous) qc.setQueryData(key, context.previous);
    },
    onSuccess: (feature) => {
      qc.setQueryData<MapFeature[]>(key, (list) =>
        list?.map((f) => (f.id === feature.id ? feature : f)),
      );
      invalidateAtlas(qc, worldId);
    },
  });
}

export function useDeleteFeature(worldId: string, mapId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      api<void>('DELETE', `/worlds/${worldId}/maps/${mapId}/features/${id}`),
    onSuccess: (_void, id) => {
      qc.setQueryData<MapFeature[]>(atlasKeys.features(worldId, mapId), (list) =>
        list?.filter((f) => f.id !== id),
      );
      invalidateAtlas(qc, worldId);
    },
  });
}
