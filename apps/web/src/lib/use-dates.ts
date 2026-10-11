import { useMemo } from 'react';
import { formatDate, formatSpan, formatYear } from '@atlas/shared';
import { useWorld } from '@/lib/world-context';

/** Turns day numbers into text using the world's calendar. */
export function useDates() {
  const { calendar } = useWorld();
  return useMemo(
    () => ({
      calendar,
      /** "29 Frostmoon, 342 AF", or with the weekday in front. */
      date: (day: number, options?: { weekday?: boolean }) => formatDate(calendar, day, options),
      year: (year: number) => formatYear(calendar, year),
      /** "342 AF to 380 AF", with "…" for an open end; empty when neither is set. */
      span: (from: number | null, to: number | null) => formatSpan(calendar, from, to),
    }),
    [calendar],
  );
}
