import { keepPreviousData, useQuery } from '@tanstack/react-query';
import type { FamilyData, GraphData } from '@atlas/shared';
import { api } from './client';

export interface GraphParams {
  focus?: string | null;
  depth?: number;
  limit?: number;
}

export const graphKeys = {
  graph: (worldId: string, params: GraphParams) => ['graph', worldId, params] as const,
  family: (worldId: string, entityId: string, up: number, down: number) =>
    ['family', worldId, entityId, up, down] as const,
};

/** The graph of one entry's neighbourhood, or of the most connected entries with no focus. */
export const useGraph = (worldId: string, params: GraphParams) =>
  useQuery({
    queryKey: graphKeys.graph(worldId, params),
    queryFn: () => {
      const query = new URLSearchParams();
      if (params.focus) query.set('focus', params.focus);
      if (params.depth) query.set('depth', String(params.depth));
      if (params.limit) query.set('limit', String(params.limit));
      return api<GraphData>('GET', `/worlds/${worldId}/graph?${query}`);
    },
    // Keep the old picture on screen while the next one loads.
    placeholderData: keepPreviousData,
  });

export const useFamily = (worldId: string, entityId: string, up: number, down: number) =>
  useQuery({
    queryKey: graphKeys.family(worldId, entityId, up, down),
    queryFn: () =>
      api<FamilyData>('GET', `/worlds/${worldId}/family/${entityId}?up=${up}&down=${down}`),
    placeholderData: keepPreviousData,
  });
