import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  SprintCreateInput,
  WritingGoalsInput,
  WritingSprint,
  WritingStats,
} from '@atlas/shared';
import { api } from './client';

export const writingKey = (worldId: string) => ['writing', worldId] as const;

/** The browser's own time zone, so a new writer's days are counted where they live. */
const browserZone = () => {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone;
  } catch {
    return undefined;
  }
};

export const fetchWritingStats = (worldId: string) => {
  const zone = browserZone();
  const query = zone ? `?timezone=${encodeURIComponent(zone)}` : '';
  return api<WritingStats>('GET', `/worlds/${worldId}/writing${query}`);
};

/** `watch` refetches now and then, for a timer that shows words as they are written. */
export const useWritingStats = (
  worldId: string,
  options: { watch?: boolean; enabled?: boolean } = {},
) =>
  useQuery({
    queryKey: writingKey(worldId),
    queryFn: () => fetchWritingStats(worldId),
    enabled: options.enabled ?? true,
    staleTime: 5_000,
    refetchInterval: options.watch ? 10_000 : false,
  });

export function useSaveGoals(worldId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: WritingGoalsInput) =>
      api<WritingStats>('PUT', `/worlds/${worldId}/writing/goals`, input),
    onSuccess: (stats) => qc.setQueryData(writingKey(worldId), stats),
  });
}

export function useAddSprint(worldId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: SprintCreateInput) =>
      api<WritingSprint>('POST', `/worlds/${worldId}/writing/sprints`, input),
    onSuccess: () => qc.invalidateQueries({ queryKey: writingKey(worldId) }),
  });
}
