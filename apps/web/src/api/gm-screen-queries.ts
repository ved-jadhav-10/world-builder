import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { GmScreen, GmWidget } from '@atlas/shared';
import { api } from './client';

export const gmScreenKey = (worldId: string) => ['gm-screen', worldId] as const;

export const useGmScreen = (worldId: string) =>
  useQuery({
    queryKey: gmScreenKey(worldId),
    queryFn: () => api<GmScreen>('GET', `/worlds/${worldId}/gm-screen`),
    // The page keeps its own working copy; it should not be replaced when the window refocuses.
    staleTime: Infinity,
    refetchOnWindowFocus: false,
  });

/** Saves the whole arrangement. The answer carries the pinned entries, resolved. */
export function useSaveGmScreen(worldId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (widgets: GmWidget[]) =>
      api<GmScreen>('PUT', `/worlds/${worldId}/gm-screen`, { widgets }),
    onSuccess: (screen) => qc.setQueryData(gmScreenKey(worldId), screen),
  });
}
