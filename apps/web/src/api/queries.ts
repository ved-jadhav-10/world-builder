import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
  keepPreviousData,
} from '@tanstack/react-query';
import type {
  BulkEntityInput,
  BulkEntityResult,
  Entity,
  EntityIndexItem,
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
  PreviewAudience,
  TagCreateInput,
  TrashedEntity,
  World,
  WorldCreateInput,
  WorldUpdateInput,
  Visibility,
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
  params: {
    typeId?: string;
    tagId?: string;
    /** Only entries usable in this book: the shared ones and those scoped to it. */
    bookId?: string;
    visibility?: Visibility;
    sort?: EntitySort;
    limit?: number;
  },
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

/** Every visible entry, name only, for the content tree. */
export const useEntityIndex = (worldId: string) =>
  useQuery({
    queryKey: [...keys.entities(worldId), 'index'],
    queryFn: () => api<EntityIndexItem[]>('GET', `/worlds/${worldId}/entities/index`),
  });

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

/** One change (visibility, a tag, the trash) applied to many entries at once. */
export function useBulkEntities(worldId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: BulkEntityInput) =>
      api<BulkEntityResult>('POST', `/worlds/${worldId}/entities/bulk`, input),
    onSuccess: () => {
      invalidateWorldContent(qc, worldId);
      void qc.invalidateQueries({ queryKey: keys.tags(worldId) });
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

/** Saves a file the API sends, through the browser's download. */
async function download(path: string, filename: string) {
  const response = await fetch(`/api${path}`, { credentials: 'same-origin' });
  if (!response.ok) {
    // The API says what is wrong ("the manuscript has no text yet"); show that when it does.
    const body = (await response.json().catch(() => null)) as { message?: string } | null;
    throw new Error(body?.message ?? 'Export failed');
  }
  const url = URL.createObjectURL(await response.blob());
  const link = Object.assign(document.createElement('a'), { href: url, download: filename });
  link.click();
  URL.revokeObjectURL(url);
}

const today = () => new Date().toISOString().slice(0, 10);

/** Who an export is for. Anything but the GM's own copy holds only what that audience can see. */
export type ExportAudience = 'gm' | PreviewAudience;
const audienceQuery = (audience: ExportAudience) =>
  audience === 'gm' ? '' : `?audience=${audience}`;
const audienceSuffix = (audience: ExportAudience) => (audience === 'gm' ? '' : `-${audience}`);

/** Downloads the world's JSON export via the browser. */
export const downloadExport = (world: World, audience: ExportAudience = 'gm') =>
  download(
    `/worlds/${world.id}/export${audienceQuery(audience)}`,
    `${world.slug}${audienceSuffix(audience)}-${today()}.json`,
  );

/** Downloads the manuscript as a Word document. */
export const downloadManuscriptDocx = (
  world: World,
  options: {
    bookId?: string;
    format: 'manuscript' | 'clean';
    paper: 'letter' | 'a4';
    author?: string;
  },
) => {
  const query = new URLSearchParams({ format: options.format, paper: options.paper });
  if (options.bookId) query.set('bookId', options.bookId);
  if (options.author) query.set('author', options.author);
  return download(
    `/worlds/${world.id}/export/manuscript.docx?${query}`,
    `${world.slug}-manuscript-${today()}.docx`,
  );
};

/** Downloads the manuscript as a PDF. */
export const downloadManuscriptPdf = (
  world: World,
  options: {
    bookId?: string;
    format: 'manuscript' | 'clean';
    paper: 'letter' | 'a4';
    author?: string;
  },
) => {
  const query = new URLSearchParams({ format: options.format, paper: options.paper });
  if (options.bookId) query.set('bookId', options.bookId);
  if (options.author) query.set('author', options.author);
  return download(
    `/worlds/${world.id}/export/manuscript.pdf?${query}`,
    `${world.slug}-manuscript-${today()}.pdf`,
  );
};

/** Downloads the manuscript laid out as a screenplay (Fountain) or a comic script. */
export const downloadManuscriptScript = (
  world: World,
  options: { kind: 'screenplay' | 'comic'; bookId?: string; author?: string },
) => {
  const query = new URLSearchParams({ kind: options.kind });
  if (options.bookId) query.set('bookId', options.bookId);
  if (options.author) query.set('author', options.author);
  return download(
    `/worlds/${world.id}/export/manuscript-script?${query}`,
    `${world.slug}-${options.kind === 'screenplay' ? 'screenplay.fountain' : 'comic-script.txt'}`,
  );
};

/** Downloads the whole world as a printable story bible (PDF). */
export const downloadStoryBible = (world: World) =>
  download(
    `/worlds/${world.id}/export/story-bible.pdf`,
    `${world.slug}-story-bible-${today()}.pdf`,
  );

/** Downloads the manuscript as an EPUB for e-readers. */
export const downloadManuscriptEpub = (
  world: World,
  options: { bookId?: string; author?: string },
) => {
  const query = new URLSearchParams();
  if (options.bookId) query.set('bookId', options.bookId);
  if (options.author) query.set('author', options.author);
  return download(
    `/worlds/${world.id}/export/manuscript.epub?${query}`,
    `${world.slug}-manuscript-${today()}.epub`,
  );
};

/** Downloads the world as a zip of Markdown notes, pictures and JSON. */
export const downloadMarkdownExport = (world: World, audience: ExportAudience = 'gm') =>
  download(
    `/worlds/${world.id}/export/markdown${audienceQuery(audience)}`,
    `${world.slug}-markdown${audienceSuffix(audience)}-${today()}.zip`,
  );

/** Downloads a map as a Universal VTT file for tabletop apps. */
export const downloadMapVtt = (world: World, map: { id: string; name: string }, grid: number) =>
  download(
    `/worlds/${world.id}/maps/${map.id}/export/vtt?grid=${grid}`,
    `${map.name.replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-|-$/g, '') || 'map'}.dd2vtt`,
  );
