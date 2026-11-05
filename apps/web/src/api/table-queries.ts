import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  DiceRollInput,
  RollLogEntry,
  RollTable,
  RollTableCreateInput,
  RollTableSummary,
  RollTableUpdateInput,
  TableRollInput,
} from '@atlas/shared';
import { api } from './client';

export const tableKeys = {
  all: (worldId: string) => ['tables', worldId] as const,
  one: (worldId: string, tableId: string) => ['tables', worldId, tableId] as const,
  rolls: (worldId: string) => ['rolls', worldId] as const,
};

export const useTables = (worldId: string) =>
  useQuery({
    queryKey: tableKeys.all(worldId),
    queryFn: () => api<RollTableSummary[]>('GET', `/worlds/${worldId}/tables`),
  });

export const useTable = (worldId: string, tableId: string | undefined) =>
  useQuery({
    queryKey: tableKeys.one(worldId, tableId ?? ''),
    queryFn: () => api<RollTable>('GET', `/worlds/${worldId}/tables/${tableId}`),
    enabled: Boolean(tableId),
  });

export function useCreateTable(worldId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: RollTableCreateInput) =>
      api<RollTable>('POST', `/worlds/${worldId}/tables`, input),
    onSuccess: () => void qc.invalidateQueries({ queryKey: tableKeys.all(worldId) }),
  });
}

export function useUpdateTable(worldId: string, tableId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: RollTableUpdateInput) =>
      api<RollTable>('PATCH', `/worlds/${worldId}/tables/${tableId}`, input),
    onSuccess: (table) => {
      qc.setQueryData(tableKeys.one(worldId, tableId), table);
      void qc.invalidateQueries({ queryKey: tableKeys.all(worldId), exact: true });
    },
  });
}

export function useDeleteTable(worldId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (tableId: string) => api<void>('DELETE', `/worlds/${worldId}/tables/${tableId}`),
    // Only the list is refreshed: the deleted table's own page is still on screen until the
    // caller navigates away, and refetching it would just report it missing.
    onSuccess: () => void qc.invalidateQueries({ queryKey: tableKeys.all(worldId), exact: true }),
  });
}

/** The latest rolls. Refreshed every few seconds so a player sees what the GM shares. */
export const useRolls = (worldId: string, limit = 30) =>
  useQuery({
    queryKey: [...tableKeys.rolls(worldId), limit],
    queryFn: () => api<RollLogEntry[]>('GET', `/worlds/${worldId}/rolls?limit=${limit}`),
    refetchInterval: 5000,
  });

export function useRollDice(worldId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: DiceRollInput) =>
      api<RollLogEntry>('POST', `/worlds/${worldId}/dice/roll`, input),
    onSuccess: () => void qc.invalidateQueries({ queryKey: tableKeys.rolls(worldId) }),
  });
}

export function useRollTable(worldId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ tableId, ...input }: TableRollInput & { tableId: string }) =>
      api<RollLogEntry>('POST', `/worlds/${worldId}/tables/${tableId}/roll`, input),
    onSuccess: () => void qc.invalidateQueries({ queryKey: tableKeys.rolls(worldId) }),
  });
}

export function useClearRolls(worldId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api<void>('DELETE', `/worlds/${worldId}/rolls`),
    onSuccess: () => void qc.invalidateQueries({ queryKey: tableKeys.rolls(worldId) }),
  });
}
