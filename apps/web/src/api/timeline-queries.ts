import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  Calendar,
  CalendarUpdateInput,
  ExtraCalendar,
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

/** Every change in the world, for the arc tracker. GM only. */
export const useWorldProgressions = (worldId: string) =>
  useQuery({
    queryKey: ['progressions', worldId, 'all'] as const,
    queryFn: () => api<Progression[]>('GET', `/worlds/${worldId}/progressions`),
    // Changes are written from entry pages, so always look again when the tracker opens.
    staleTime: 0,
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

export const extraCalendarsKey = (worldId: string) => ['calendars', worldId] as const;

export const useExtraCalendars = (worldId: string) =>
  useQuery({
    queryKey: extraCalendarsKey(worldId),
    queryFn: () => api<ExtraCalendar[]>('GET', `/worlds/${worldId}/calendars`),
  });

export function useCreateExtraCalendar(worldId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CalendarUpdateInput) =>
      api<ExtraCalendar>('POST', `/worlds/${worldId}/calendars`, input),
    onSuccess: () => qc.invalidateQueries({ queryKey: extraCalendarsKey(worldId) }),
  });
}

export function useSaveExtraCalendar(worldId: string, id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CalendarUpdateInput) =>
      api<ExtraCalendar>('PUT', `/worlds/${worldId}/calendars/${id}`, input),
    onSuccess: () => qc.invalidateQueries({ queryKey: extraCalendarsKey(worldId) }),
  });
}

export function useDeleteExtraCalendar(worldId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api<void>('DELETE', `/worlds/${worldId}/calendars/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: extraCalendarsKey(worldId) }),
  });
}

/** Sets or clears the world's "today". */
export function useSetToday(worldId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (day: number | null) =>
      api<Calendar>('PUT', `/worlds/${worldId}/calendar/today`, { day }),
    onSuccess: (calendar) => qc.setQueryData(timelineKeys.calendar(worldId), calendar),
  });
}
