import { z } from 'zod';
import { idSchema } from './common';

export const GM_WIDGET_TYPES = ['dice', 'table', 'entries', 'notes', 'clock', 'session'] as const;
export type GmWidgetType = (typeof GM_WIDGET_TYPES)[number];

export const GM_WIDGET_LABELS: Record<GmWidgetType, string> = {
  dice: 'Dice and roll log',
  table: 'Table roller',
  entries: 'Pinned entries',
  notes: 'Scratchpad',
  clock: 'Clock',
  session: 'Current session',
};

export const MAX_GM_WIDGETS = 24;
export const MAX_PINNED_ENTRIES = 30;
export const MAX_SCRATCHPAD = 20_000;
export const CLOCK_SEGMENT_CHOICES = [4, 6, 8, 10, 12] as const;

const base = {
  /** Made by the browser; only has to be unique on one screen. */
  id: z.string().trim().min(1).max(40),
  title: z.string().trim().max(80).default(''),
};

export const gmWidgetSchema = z.discriminatedUnion('type', [
  z.object({ ...base, type: z.literal('dice') }),
  z.object({ ...base, type: z.literal('table'), tableId: idSchema.nullable().default(null) }),
  z.object({
    ...base,
    type: z.literal('entries'),
    entityIds: z.array(idSchema).max(MAX_PINNED_ENTRIES).default([]),
  }),
  z.object({ ...base, type: z.literal('notes'), text: z.string().max(MAX_SCRATCHPAD).default('') }),
  z
    .object({
      ...base,
      type: z.literal('clock'),
      segments: z.number().int().min(2).max(12).default(6),
      filled: z.number().int().min(0).max(12).default(0),
    })
    .refine((clock) => clock.filled <= clock.segments, {
      path: ['filled'],
      message: 'A clock cannot be filled past its segments',
    }),
  z.object({ ...base, type: z.literal('session') }),
]);
export type GmWidget = z.infer<typeof gmWidgetSchema>;

/** One GM's own arrangement of widgets for one world: the order they are listed in. */
export const gmScreenSchema = z
  .object({ widgets: z.array(gmWidgetSchema).max(MAX_GM_WIDGETS) })
  .refine((screen) => new Set(screen.widgets.map((w) => w.id)).size === screen.widgets.length, {
    path: ['widgets'],
    message: 'Widgets need distinct ids',
  });
export type GmScreenInput = z.input<typeof gmScreenSchema>;
