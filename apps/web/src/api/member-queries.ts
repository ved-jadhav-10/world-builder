import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  CreatedInvite,
  Invite,
  InviteCreateInput,
  InvitePreview,
  JoinResult,
  Member,
  MemberEvent,
  MemberUpdateInput,
} from '@atlas/shared';
import { api } from './client';
import { keys } from './queries';

export const memberKeys = {
  members: (worldId: string) => ['members', worldId] as const,
  invites: (worldId: string) => ['invites', worldId] as const,
  events: (worldId: string) => ['member-events', worldId] as const,
  invite: (token: string) => ['invite', token] as const,
};

// ---- Members and the links that bring them in (the owner's view) --------------------------------

export const useMembers = (worldId: string) =>
  useQuery({
    queryKey: memberKeys.members(worldId),
    queryFn: () => api<Member[]>('GET', `/worlds/${worldId}/members`),
  });

export function useUpdateMember(worldId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ userId, ...input }: MemberUpdateInput & { userId: string }) =>
      api<void>('PATCH', `/worlds/${worldId}/members/${encodeURIComponent(userId)}`, input),
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: memberKeys.members(worldId) });
      void qc.invalidateQueries({ queryKey: memberKeys.events(worldId) });
    },
  });
}

export function useRemoveMember(worldId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (userId: string) =>
      api<void>('DELETE', `/worlds/${worldId}/members/${encodeURIComponent(userId)}`),
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: memberKeys.members(worldId) });
      void qc.invalidateQueries({ queryKey: memberKeys.events(worldId) });
    },
  });
}

export const useMemberEvents = (worldId: string) =>
  useQuery({
    queryKey: memberKeys.events(worldId),
    queryFn: () => api<MemberEvent[]>('GET', `/worlds/${worldId}/member-events`),
  });

export function useTransferOwnership(worldId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (userId: string) =>
      api<void>('POST', `/worlds/${worldId}/transfer-ownership`, { userId }),
    onSettled: () => {
      // The old owner can no longer read these, so forget them rather than refetch (a 403).
      qc.removeQueries({ queryKey: memberKeys.members(worldId) });
      qc.removeQueries({ queryKey: memberKeys.events(worldId) });
      qc.removeQueries({ queryKey: memberKeys.invites(worldId) });
      void qc.invalidateQueries({ queryKey: keys.worlds });
      // The world page reads the role from its own by-slug entry.
      void qc.invalidateQueries({ queryKey: ['world'] });
    },
  });
}

export const useInvites = (worldId: string) =>
  useQuery({
    queryKey: memberKeys.invites(worldId),
    queryFn: () => api<Invite[]>('GET', `/worlds/${worldId}/invites`),
  });

export function useCreateInvite(worldId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: InviteCreateInput) =>
      api<CreatedInvite>('POST', `/worlds/${worldId}/invites`, input),
    onSuccess: () => qc.invalidateQueries({ queryKey: memberKeys.invites(worldId) }),
  });
}

export function useDeleteInvite(worldId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api<void>('DELETE', `/worlds/${worldId}/invites/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: memberKeys.invites(worldId) }),
  });
}

/** Leaving a world you were invited to. The owner cannot. */
export function useLeaveWorld(worldId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api<void>('DELETE', `/worlds/${worldId}/members/me`),
    onSuccess: () => {
      // Nothing cached for that world should stay around, and the list of worlds has changed.
      qc.removeQueries({
        predicate: (q) => q.queryKey[0] === 'world' || q.queryKey.includes(worldId),
      });
      void qc.invalidateQueries({ queryKey: keys.worlds });
    },
  });
}

// ---- Using a link ------------------------------------------------------------------------------

export const useInvitePreview = (token: string) =>
  useQuery({
    queryKey: memberKeys.invite(token),
    queryFn: () => api<InvitePreview>('GET', `/invites/${encodeURIComponent(token)}`),
    // A cancelled or expired link will not come back; don't keep asking.
    staleTime: Infinity,
  });

export function useAcceptInvite(token: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api<JoinResult>('POST', `/invites/${encodeURIComponent(token)}/accept`),
    onSuccess: () => qc.invalidateQueries({ queryKey: keys.worlds }),
  });
}

/** The address to share for an invite. */
export const inviteUrl = (token: string) => `${window.location.origin}/join/${token}`;
