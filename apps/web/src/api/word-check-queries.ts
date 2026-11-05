import { keepPreviousData, useQuery } from '@tanstack/react-query';
import type { WordCheckResult } from '@atlas/shared';
import { api } from './client';

/** Checks the whole manuscript or one part of it; `watch` is a comma-separated list of words. */
export const useWordCheck = (worldId: string, nodeId: string, watch: string) =>
  useQuery({
    queryKey: ['word-check', worldId, nodeId, watch],
    queryFn: () => {
      const search = new URLSearchParams();
      if (nodeId) search.set('nodeId', nodeId);
      if (watch) search.set('watch', watch);
      return api<WordCheckResult>('GET', `/worlds/${worldId}/manuscript/word-check?${search}`);
    },
    placeholderData: keepPreviousData,
  });
