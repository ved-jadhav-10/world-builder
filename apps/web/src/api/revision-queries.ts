import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  Entity,
  EntityRevisionContent,
  RevisionDetail,
  RevisionSummary,
  Scene,
  SceneRevisionContent,
} from '@atlas/shared';
import { api } from './client';
import { keys } from './queries';
import { manuscriptKeys } from './manuscript-queries';

/** What has a history, and where its API lives. */
export type HistorySubject = 'entity' | 'scene';

const basePath = (worldId: string, subject: HistorySubject, id: string) =>
  `/worlds/${worldId}/${subject === 'entity' ? 'entities' : 'manuscript/scenes'}/${id}/revisions`;

const revisionKeys = {
  list: (worldId: string, subject: HistorySubject, id: string) =>
    ['revisions', worldId, subject, id] as const,
  one: (worldId: string, subject: HistorySubject, id: string, revisionId: string) =>
    ['revisions', worldId, subject, id, revisionId] as const,
};

export const useRevisions = (
  worldId: string,
  subject: HistorySubject,
  id: string,
  enabled: boolean,
) =>
  useQuery({
    queryKey: revisionKeys.list(worldId, subject, id),
    queryFn: () => api<RevisionSummary[]>('GET', basePath(worldId, subject, id)),
    enabled,
    // The list is read each time the dialog opens, since saving makes new versions.
    staleTime: 0,
  });

export const useRevision = (
  worldId: string,
  subject: HistorySubject,
  id: string,
  revisionId: string | null,
) =>
  useQuery({
    queryKey: revisionKeys.one(worldId, subject, id, revisionId ?? ''),
    queryFn: () =>
      api<RevisionDetail<EntityRevisionContent | SceneRevisionContent>>(
        'GET',
        `${basePath(worldId, subject, id)}/${revisionId}`,
      ),
    enabled: revisionId !== null,
    // A saved version never changes.
    staleTime: Infinity,
  });

export function useCreateRevision(worldId: string, subject: HistorySubject, id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (label: string) =>
      api<RevisionSummary>('POST', basePath(worldId, subject, id), { label }),
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: revisionKeys.list(worldId, subject, id), exact: true }),
  });
}

export function useDeleteRevision(worldId: string, subject: HistorySubject, id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (revisionId: string) =>
      api<void>('DELETE', `${basePath(worldId, subject, id)}/${revisionId}`),
    onSuccess: (_void, revisionId) => {
      qc.removeQueries({ queryKey: revisionKeys.one(worldId, subject, id, revisionId) });
      return qc.invalidateQueries({
        queryKey: revisionKeys.list(worldId, subject, id),
        exact: true,
      });
    },
  });
}

/** Brings a version back; the answer is the entry or scene as it now reads. */
export function useRestoreRevision(worldId: string, subject: HistorySubject, id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (revisionId: string) =>
      api<Entity | Scene>('POST', `${basePath(worldId, subject, id)}/${revisionId}/restore`),
    onSuccess: (restored) => {
      if (subject === 'entity') qc.setQueryData(keys.entity(worldId, id), restored);
      else qc.setQueryData(manuscriptKeys.scene(worldId, id), restored);
      void qc.invalidateQueries({ queryKey: revisionKeys.list(worldId, subject, id), exact: true });
      // Names, mentions and word counts around it may have changed.
      void qc.invalidateQueries({ queryKey: keys.entities(worldId) });
      void qc.invalidateQueries({ queryKey: manuscriptKeys.tree(worldId), exact: true });
      void qc.invalidateQueries({ queryKey: ['appearances', worldId] });
    },
  });
}
