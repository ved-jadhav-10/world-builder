import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { Comment, CommentCreateInput, CommentUpdateInput, InboxThread } from '@atlas/shared';
import { getViewAs } from '@/lib/view-as';
import { api } from './client';

/** What can be discussed, and where its comments live in the API. */
export type CommentSubject = { kind: 'entity' | 'scene'; id: string };

const subjectPath = (worldId: string, { kind, id }: CommentSubject) =>
  `/worlds/${worldId}/${kind === 'entity' ? 'entities' : 'manuscript/scenes'}/${id}/comments`;

export const commentKey = (worldId: string) => ['comments', worldId] as const;

export const useComments = (worldId: string, subject: CommentSubject, enabled = true) =>
  useQuery({
    queryKey: [...commentKey(worldId), subject.kind, subject.id],
    // Comments are never shown in a preview; skipping the request avoids a refused call while the
    // view is switching.
    queryFn: async () => (getViewAs() ? [] : api<Comment[]>('GET', subjectPath(worldId, subject))),
    enabled,
  });

export const useCommentInbox = (worldId: string, status: 'open' | 'resolved' | 'all') =>
  useQuery({
    queryKey: [...commentKey(worldId), 'inbox', status],
    queryFn: () => api<InboxThread[]>('GET', `/worlds/${worldId}/comments?status=${status}`),
  });

export function useCreateComment(worldId: string, subject: CommentSubject) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CommentCreateInput) =>
      api<Comment>('POST', subjectPath(worldId, subject), input),
    onSuccess: () => qc.invalidateQueries({ queryKey: commentKey(worldId) }),
  });
}

export function useUpdateComment(worldId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...input }: CommentUpdateInput & { id: string }) =>
      api<Comment>('PATCH', `/worlds/${worldId}/comments/${id}`, input),
    onSuccess: () => qc.invalidateQueries({ queryKey: commentKey(worldId) }),
  });
}

export function useDeleteComment(worldId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api<void>('DELETE', `/worlds/${worldId}/comments/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: commentKey(worldId) }),
  });
}
