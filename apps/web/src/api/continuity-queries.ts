import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { ContinuityReport } from '@atlas/shared';
import { api } from './client';

export const continuityKey = (worldId: string) => ['continuity', worldId] as const;

/** Runs the checks. Always fresh when the page opens: it reflects the story as it is now. */
export const useContinuity = (worldId: string) =>
  useQuery({
    queryKey: continuityKey(worldId),
    queryFn: () => api<ContinuityReport>('GET', `/worlds/${worldId}/continuity`),
    staleTime: 0,
  });

export function useDismissFinding(worldId: string) {
  const qc = useQueryClient();
  const key = continuityKey(worldId);
  return useMutation({
    mutationFn: ({ key: findingKey, restore }: { key: string; restore?: boolean }) =>
      restore
        ? api<void>(
            'DELETE',
            `/worlds/${worldId}/continuity/dismissals?key=${encodeURIComponent(findingKey)}`,
          )
        : api<void>('POST', `/worlds/${worldId}/continuity/dismissals`, { key: findingKey }),
    // The finding moves between the two lists at once, and goes back if the server refuses.
    onMutate: async ({ key: findingKey, restore }) => {
      await qc.cancelQueries({ queryKey: key });
      const previous = qc.getQueryData<ContinuityReport>(key);
      if (previous) {
        const from = restore ? previous.dismissed : previous.findings;
        const moved = from.find((f) => f.key === findingKey);
        if (moved) {
          qc.setQueryData<ContinuityReport>(key, {
            ...previous,
            findings: restore
              ? [...previous.findings, moved]
              : previous.findings.filter((f) => f.key !== findingKey),
            dismissed: restore
              ? previous.dismissed.filter((f) => f.key !== findingKey)
              : [...previous.dismissed, moved],
          });
        }
      }
      return { previous };
    },
    onError: (_error, _input, context) => {
      if (context?.previous) qc.setQueryData(key, context.previous);
    },
    onSettled: () => void qc.invalidateQueries({ queryKey: key }),
  });
}
