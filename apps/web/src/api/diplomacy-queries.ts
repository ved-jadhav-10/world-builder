import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { DiplomacyScore, DiplomacySetInput } from '@atlas/shared';
import { api } from './client';

export const diplomacyKey = (worldId: string) => ['diplomacy', worldId] as const;

export const useDiplomacy = (worldId: string) =>
  useQuery({
    queryKey: diplomacyKey(worldId),
    queryFn: () => api<DiplomacyScore[]>('GET', `/worlds/${worldId}/diplomacy`),
  });

export function useSetDiplomacy(worldId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: DiplomacySetInput) =>
      api<DiplomacyScore>('PUT', `/worlds/${worldId}/diplomacy`, input),
    onSuccess: () => qc.invalidateQueries({ queryKey: diplomacyKey(worldId) }),
  });
}

export function useDeleteDiplomacy(worldId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api<void>('DELETE', `/worlds/${worldId}/diplomacy/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: diplomacyKey(worldId) }),
  });
}
