import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
  keepPreviousData,
} from '@tanstack/react-query';
import type {
  Entity,
  EntityCreateInput,
  EntityRelationship,
  EntitySort,
  EntitySummary,
  EntityType,
  EntityTypeCreateInput,
  EntityTypeUpdateInput,
  EntityUpdateInput,
  Page,
  RelationshipCreateInput,
  RelationshipType,
  RelationshipTypeCreateInput,
  RelationshipUpdateInput,
  SearchResult,
  Tag,
  TagCreateInput,
  TrashedEntity,
  World,
  WorldCreateInput,
  WorldUpdateInput,
} from '@atlas/shared';
import { api } from './client';

export const keys = {
  worlds: ['worlds'] as const,
  world: (slug: string) => ['world', slug] as const,
  entityTypes: (worldId: string) => ['entity-types', worldId] as const,
  entities: (worldId: string) => ['entities', worldId] as const,
  entity: (worldId: string, id: string) => ['entities', worldId, 'one', id] as const,
  relationships: (worldId: string) => ['relationships', worldId] as const,
  relationshipTypes: (worldId: string) => ['relationship-types', worldId] as const,
  tags: (worldId: string) => ['tags', worldId] as const,
  search: (worldId: string, q: string) => ['search', worldId, q] as const,
  trash: (worldId: string) => ['trash', worldId] as const,
};

// ---- Worlds ---------------------------------------------------------------

export const useWorlds = () =>
  useQuery({ queryKey: keys.worlds, queryFn: () => api<World[]>('GET', '/worlds') });

export const useWorldBySlug = (slug: string) =>
  useQuery({
    queryKey: keys.world(slug),
    queryFn: () => api<World>('GET', `/worlds/by-slug/${encodeURIComponent(slug)}`),
  });

export function useCreateWorld() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: WorldCreateInput) => api<World>('POST', '/worlds', input),
    onSuccess: () => qc.invalidateQueries({ queryKey: keys.worlds }),
  });
}

export function useUpdateWorld(world: World) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: WorldUpdateInput) => api<World>('PATCH', `/worlds/${world.id}`, input),
    onSuccess: (updated) => {
      qc.setQueryData(keys.world(world.slug), updated);
      void qc.invalidateQueries({ queryKey: keys.worlds });
    },
  });
}

export function useDeleteWorld(worldId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api<void>('DELETE', `/worlds/${worldId}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: keys.worlds }),
  });
}

// ---- Entity types ---------------------------------------------------------

export const useEntityTypes = (worldId: string | undefined) =>
  useQuery({
    queryKey: keys.entityTypes(worldId ?? ''),
    queryFn: () => api<EntityType[]>('GET', `/worlds/${worldId}/entity-types`),
    enabled: Boolean(worldId),
  });

export function useCreateEntityType(worldId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: EntityTypeCreateInput) =>
      api<EntityType>('POST', `/worlds/${worldId}/entity-types`, input),
    onSuccess: () => qc.invalidateQueries({ queryKey: keys.entityTypes(worldId) }),
  });
}

export function useUpdateEntityType(worldId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...input }: EntityTypeUpdateInput & { id: string }) =>
      api<EntityType>('PATCH', `/worlds/${worldId}/entity-types/${id}`, input),
    onSuccess: () => qc.invalidateQueries({ queryKey: keys.entityTypes(worldId) }),
  });
}

export function useDeleteEntityType(worldId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api<void>('DELETE', `/worlds/${worldId}/entity-types/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: keys.entityTypes(worldId) }),
  });
}

// ---- Entities -------------------------------------------------------------

export function useEntityList(
  worldId: string,
  params: { typeId?: string; tagId?: string; sort?: EntitySort; limit?: number },
) {
  return useInfiniteQuery({
    queryKey: [...keys.entities(worldId), 'list', params],
    queryFn: ({ pageParam }) => {
      const search = new URLSearchParams();
      for (const [key, value] of Object.entries({ ...params, cursor: pageParam })) {
        if (value !== undefined && value !== '') search.set(key, String(value));
      }
      return api<Page<EntitySummary>>('GET', `/worlds/${worldId}/entities?${search}`);
    },
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.nextCursor ?? undefined,
    placeholderData: keepPreviousData,
  });
}

export const useEntity = (worldId: string, id: string) =>
  useQuery({
    queryKey: keys.entity(worldId, id),
    queryFn: () => api<Entity>('GET', `/worlds/${worldId}/entities/${id}`),
  });

/**
 * Entity writes change lists, counts, search results and relationship labels.
 * `skipEntityId` leaves a just-trashed entity's own queries alone (refetching them would 404).
 */
function invalidateWorldContent(
  qc: ReturnType<typeof useQueryClient>,
  worldId: string,
  skipEntityId?: string,
) {
  for (const key of [
    keys.entities(worldId),
    keys.entityTypes(worldId),
    keys.relationships(worldId),
    ['search', worldId],
    keys.trash(worldId),
    ['mention-index', worldId],
    ['appearances', worldId],
    ['timeline', worldId],
  ]) {
    void qc.invalidateQueries({
      queryKey: key,
      predicate: (query) => !skipEntityId || !query.queryKey.includes(skipEntityId),
    });
  }
}

export function useCreateEntity(worldId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: EntityCreateInput) =>
      api<Entity>('POST', `/worlds/${worldId}/entities`, input),
    onSuccess: () => invalidateWorldContent(qc, worldId),
  });
}

export function useUpdateEntity(worldId: string, id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: EntityUpdateInput) =>
      api<Entity>('PATCH', `/worlds/${worldId}/entities/${id}`, input),
    onSuccess: (entity) => {
      qc.setQueryData(keys.entity(worldId, id), entity);
      invalidateWorldContent(qc, worldId);
    },
  });
}

export function useDeleteEntity(worldId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api<void>('DELETE', `/worlds/${worldId}/entities/${id}`),
    onSuccess: (_data, id) => invalidateWorldContent(qc, worldId, id),
  });
}

export const useTrash = (worldId: string) =>
  useQuery({
    queryKey: keys.trash(worldId),
    queryFn: () => api<TrashedEntity[]>('GET', `/worlds/${worldId}/trash`),
  });

export function useRestoreEntity(worldId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api<Entity>('POST', `/worlds/${worldId}/trash/${id}/restore`),
    onSuccess: () => invalidateWorldContent(qc, worldId),
  });
}

export function usePurgeEntity(worldId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api<void>('DELETE', `/worlds/${worldId}/trash/${id}`),
    onSuccess: () => invalidateWorldContent(qc, worldId),
  });
}

// ---- Relationships --------------------------------------------------------

export const useRelationshipTypes = (worldId: string) =>
  useQuery({
    queryKey: keys.relationshipTypes(worldId),
    queryFn: () => api<RelationshipType[]>('GET', `/worlds/${worldId}/relationship-types`),
  });

export function useCreateRelationshipType(worldId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: RelationshipTypeCreateInput) =>
      api<RelationshipType>('POST', `/worlds/${worldId}/relationship-types`, input),
    onSuccess: () => qc.invalidateQueries({ queryKey: keys.relationshipTypes(worldId) }),
  });
}

export function useDeleteRelationshipType(worldId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api<void>('DELETE', `/worlds/${worldId}/relationship-types/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: keys.relationshipTypes(worldId) }),
  });
}

export const useEntityRelationships = (worldId: string, entityId: string) =>
  useQuery({
    queryKey: [...keys.relationships(worldId), entityId],
    queryFn: () =>
      api<EntityRelationship[]>('GET', `/worlds/${worldId}/entities/${entityId}/relationships`),
  });

export function useCreateRelationship(worldId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: RelationshipCreateInput) =>
      api<EntityRelationship>('POST', `/worlds/${worldId}/relationships`, input),
    onSuccess: () => qc.invalidateQueries({ queryKey: keys.relationships(worldId) }),
  });
}

export function useUpdateRelationship(worldId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...input }: RelationshipUpdateInput & { id: string }) =>
      api<{ id: string }>('PATCH', `/worlds/${worldId}/relationships/${id}`, input),
    onSuccess: () => qc.invalidateQueries({ queryKey: keys.relationships(worldId) }),
  });
}

export function useDeleteRelationship(worldId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api<void>('DELETE', `/worlds/${worldId}/relationships/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: keys.relationships(worldId) }),
  });
}

// ---- Tags -----------------------------------------------------------------

export const useTags = (worldId: string) =>
  useQuery({
    queryKey: keys.tags(worldId),
    queryFn: () => api<Tag[]>('GET', `/worlds/${worldId}/tags`),
  });

export function useCreateTag(worldId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: TagCreateInput) => api<Tag>('POST', `/worlds/${worldId}/tags`, input),
    onSuccess: () => qc.invalidateQueries({ queryKey: keys.tags(worldId) }),
  });
}

export function useDeleteTag(worldId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api<void>('DELETE', `/worlds/${worldId}/tags/${id}`),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: keys.tags(worldId) });
      void qc.invalidateQueries({ queryKey: keys.entities(worldId) });
    },
  });
}

export function useSetEntityTag(worldId: string, entityId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ tagId, attached }: { tagId: string; attached: boolean }) =>
      api<unknown>(
        attached ? 'PUT' : 'DELETE',
        `/worlds/${worldId}/entities/${entityId}/tags/${tagId}`,
      ),
    onSuccess: () => qc.invalidateQueries({ queryKey: keys.entities(worldId) }),
  });
}

// ---- Search & export ------------------------------------------------------

export const useSearch = (worldId: string, q: string) =>
  useQuery({
    queryKey: keys.search(worldId, q),
    queryFn: () =>
      api<SearchResult[]>('GET', `/worlds/${worldId}/search?q=${encodeURIComponent(q)}`),
    enabled: q.trim().length > 0,
    placeholderData: keepPreviousData,
    staleTime: 10_000,
  });

/** Downloads the world's JSON export via the browser. */
export async function downloadExport(world: World) {
  const response = await fetch(`/api/worlds/${world.id}/export`, { credentials: 'same-origin' });
  if (!response.ok) throw new Error('Export failed');
  const url = URL.createObjectURL(await response.blob());
  const link = Object.assign(document.createElement('a'), {
    href: url,
    download: `${world.slug}-${new Date().toISOString().slice(0, 10)}.json`,
  });
  link.click();
  URL.revokeObjectURL(url);
}
