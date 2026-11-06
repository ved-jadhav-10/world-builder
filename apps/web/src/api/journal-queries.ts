import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { Journal, PlayerJournal } from '@atlas/shared';
import { api } from './client';

const key = (worldId: string, entityId: string) => ['journal', worldId, entityId] as const;
const path = (worldId: string, entityId: string) => `/worlds/${worldId}/entities/${entityId}`;

export const useJournal = (worldId: string, entityId: string, enabled: boolean) =>
  useQuery({
    queryKey: key(worldId, entityId),
    queryFn: () => api<Journal>('GET', `${path(worldId, entityId)}/journal`),
    enabled,
    // Only this person writes them, so what is on screen is the truth.
    staleTime: Infinity,
  });

export function useSaveJournal(worldId: string, entityId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: string) =>
      api<Journal>('PUT', `${path(worldId, entityId)}/journal`, { body }),
    onSuccess: (saved) => qc.setQueryData(key(worldId, entityId), saved),
  });
}

/** Everyone's notes on an entry, for the GM. */
export const usePlayerJournals = (worldId: string, entityId: string, enabled: boolean) =>
  useQuery({
    queryKey: [...key(worldId, entityId), 'all'],
    queryFn: () => api<PlayerJournal[]>('GET', `${path(worldId, entityId)}/journals`),
    enabled,
  });
