import { z } from 'zod';

/** An IANA time zone name such as "Europe/London"; days are counted in the writer's own zone. */
export const timezoneSchema = z
  .string()
  .trim()
  .min(1)
  .max(64)
  .refine((zone) => {
    try {
      new Intl.DateTimeFormat('en-US', { timeZone: zone });
      return true;
    } catch {
      return false;
    }
  }, 'Unknown time zone');

const dateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Use a date like 2026-12-31')
  .refine((value) => {
    const date = new Date(`${value}T00:00:00Z`);
    return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
  }, 'That date does not exist');

/** Each field is optional on its own; null clears a goal. */
export const writingGoalsSchema = z.object({
  dailyWords: z.number().int().min(1).max(100_000).nullable().optional(),
  totalWords: z.number().int().min(1).max(10_000_000).nullable().optional(),
  deadline: dateSchema.nullable().optional(),
  timezone: timezoneSchema.optional(),
});
export type WritingGoalsInput = z.input<typeof writingGoalsSchema>;

export const sprintCreateSchema = z.object({
  minutes: z.number().int().min(1).max(240),
  words: z.number().int().min(0).max(100_000),
});
export type SprintCreateInput = z.input<typeof sprintCreateSchema>;

export const writingStatsQuerySchema = z.object({
  /** How many weeks of days to return, for the heatmap. */
  weeks: z.coerce.number().int().min(1).max(53).default(26),
  /** The reader's own time zone, used when no goal has stored one yet. */
  timezone: timezoneSchema.optional(),
});
export type WritingStatsQuery = z.input<typeof writingStatsQuerySchema>;
