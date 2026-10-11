import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  Calendar,
  CalendarUpdateInput,
  Progression,
  ProgressionCreateInput,
  ProgressionUpdateInput,
  TimelineData,
} from '@atlas/shared';
import { api } from './client';

export const timelineKeys = {
  calendar: (worldId: string) => ['calendar', worldId] as const,
  progressions: (worldId: string, entityId: string) => ['progressions', worldId, entityId] as const,
  timeline: (worldId: string) => ['timeline', worldId] as const,
};

export const useCalendar = (worldId: string | undefined) =>
  useQuery({
    queryKey: timelineKeys.calendar(worldId ?? ''),
    queryFn: () => api<Calendar>('GET', `/worlds/${worldId}/calendar`),
    enabled: Boolean(worldId),
  });

export function useSaveCalendar(worldId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CalendarUpdateInput) =>
      api<Calendar>('PUT', `/worlds/${worldId}/calendar`, input),
    onSuccess: (calendar) => qc.setQueryData(timelineKeys.calendar(worldId), calendar),
  });
}

/** Always refetched when the page opens, since entries and scenes are dated elsewhere. */
export const useTimeline = (worldId: string) =>
  useQuery({
    queryKey: timelineKeys.timeline(worldId),
    queryFn: () => api<TimelineData>('GET', `/worlds/${worldId}/timeline`),
    staleTime: 0,
  });

export const useProgressions = (worldId: string, entityId: string) =>
  useQuery({
    queryKey: timelineKeys.progressions(worldId, entityId),
    queryFn: () =>
      api<Progression[]>('GET', `/worlds/${worldId}/entities/${entityId}/progressions`),
  });

export function useCreateProgression(worldId: string, entityId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: ProgressionCreateInput) =>
      api<Progression>('POST', `/worlds/${worldId}/entities/${entityId}/progressions`, input),
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: timelineKeys.progressions(worldId, entityId) }),
  });
}

export function useUpdateProgression(worldId: string, entityId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...input }: ProgressionUpdateInput & { id: string }) =>
      api<Progression>('PATCH', `/worlds/${worldId}/progressions/${id}`, input),
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: timelineKeys.progressions(worldId, entityId) }),
  });
}

export function useDeleteProgression(worldId: string, entityId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api<void>('DELETE', `/worlds/${worldId}/progressions/${id}`),
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: timelineKeys.progressions(worldId, entityId) }),
  });
}
