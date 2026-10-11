import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  Appearance,
  ManuscriptNode,
  MentionIndexEntry,
  NodeCreateInput,
  NodeMoveInput,
  NodeUpdateInput,
  RichTextDoc,
  Scene,
} from '@atlas/shared';
import { api } from './client';

export const manuscriptKeys = {
  tree: (worldId: string) => ['manuscript', worldId] as const,
  scene: (worldId: string, id: string) => ['manuscript', worldId, 'scene', id] as const,
  mentionIndex: (worldId: string) => ['mention-index', worldId] as const,
  appearances: (worldId: string, entityId: string) => ['appearances', worldId, entityId] as const,
};

export const useManuscript = (worldId: string) =>
  useQuery({
    queryKey: manuscriptKeys.tree(worldId),
    queryFn: () => api<ManuscriptNode[]>('GET', `/worlds/${worldId}/manuscript`),
  });

export const useScene = (worldId: string, sceneId: string) =>
  useQuery({
    queryKey: manuscriptKeys.scene(worldId, sceneId),
    queryFn: () => api<Scene>('GET', `/worlds/${worldId}/manuscript/scenes/${sceneId}`),
    // The editor owns the text once loaded; don't refetch underneath the writer.
    staleTime: Infinity,
    refetchOnWindowFocus: false,
  });

export const useMentionIndex = (worldId: string) =>
  useQuery({
    queryKey: manuscriptKeys.mentionIndex(worldId),
    queryFn: () => api<MentionIndexEntry[]>('GET', `/worlds/${worldId}/mention-index`),
  });

export const useAppearances = (worldId: string, entityId: string) =>
  useQuery({
    queryKey: manuscriptKeys.appearances(worldId, entityId),
    queryFn: () => api<Appearance[]>('GET', `/worlds/${worldId}/entities/${entityId}/appearances`),
  });

/** Tree edits change word totals and ordering; scene text changes appearances too. */
function invalidateManuscript(qc: ReturnType<typeof useQueryClient>, worldId: string) {
  void qc.invalidateQueries({ queryKey: manuscriptKeys.tree(worldId), exact: true });
  void qc.invalidateQueries({ queryKey: ['appearances', worldId] });
}

export function useCreateNode(worldId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: NodeCreateInput) =>
      api<ManuscriptNode>('POST', `/worlds/${worldId}/manuscript/nodes`, input),
    onSuccess: () => invalidateManuscript(qc, worldId),
  });
}

export function useUpdateNode(worldId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...input }: NodeUpdateInput & { id: string }) =>
      api<ManuscriptNode>('PATCH', `/worlds/${worldId}/manuscript/nodes/${id}`, input),
    onSuccess: (node) => {
      qc.setQueryData<Scene>(manuscriptKeys.scene(worldId, node.id), (scene) =>
        scene ? { ...scene, ...node, kind: 'scene' } : scene,
      );
      invalidateManuscript(qc, worldId);
    },
  });
}

export function useMoveNode(worldId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...input }: NodeMoveInput & { id: string }) =>
      api<ManuscriptNode[]>('POST', `/worlds/${worldId}/manuscript/nodes/${id}/move`, input),
    onSuccess: (tree) => qc.setQueryData(manuscriptKeys.tree(worldId), tree),
  });
}

export function useDeleteNode(worldId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api<void>('DELETE', `/worlds/${worldId}/manuscript/nodes/${id}`),
    onSuccess: () => invalidateManuscript(qc, worldId),
  });
}

export function useSaveSceneBody(worldId: string, sceneId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: RichTextDoc | null) =>
      api<Scene>('PUT', `/worlds/${worldId}/manuscript/scenes/${sceneId}/body`, { body }),
    onSuccess: (scene) => {
      qc.setQueryData(manuscriptKeys.scene(worldId, sceneId), scene);
      invalidateManuscript(qc, worldId);
    },
  });
}
