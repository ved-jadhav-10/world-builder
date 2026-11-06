import { z } from 'zod';
import { idSchema } from './common';

export const GM_WIDGET_TYPES = [
  'dice',
  'table',
  'entries',
  'notes',
  'clock',
  'session',
  'initiative',
] as const;
export type GmWidgetType = (typeof GM_WIDGET_TYPES)[number];

export const GM_WIDGET_LABELS: Record<GmWidgetType, string> = {
  dice: 'Dice and roll log',
  table: 'Table roller',
  entries: 'Pinned entries',
  notes: 'Scratchpad',
  clock: 'Clock',
  session: 'Current session',
  initiative: 'Initiative and HP',
};

export const MAX_GM_WIDGETS = 24;
export const MAX_PINNED_ENTRIES = 30;
export const MAX_SCRATCHPAD = 20_000;
export const MAX_COMBATANTS = 40;
export const MAX_CONDITIONS = 10;
export const CLOCK_SEGMENT_CHOICES = [4, 6, 8, 10, 12] as const;

export const combatantSchema = z
  .object({
    id: z.string().trim().min(1).max(40),
    name: z.string().trim().min(1).max(80),
    /** Null until rolled. */
    initiative: z.number().int().min(-99).max(999).nullable().default(null),
    hp: z.number().int().min(0).max(99_999).nullable().default(null),
    maxHp: z.number().int().min(1).max(99_999).nullable().default(null),
    conditions: z.array(z.string().trim().min(1).max(40)).max(MAX_CONDITIONS).default([]),
    /** A pinned character or monster entry this combatant came from. */
    entityId: idSchema.nullable().default(null),
  })
  .refine((c) => c.hp === null || c.maxHp === null || c.hp <= c.maxHp, {
    path: ['hp'],
    message: 'HP cannot be above the maximum',
  });
export type Combatant = z.infer<typeof combatantSchema>;

export interface InitiativeState {
  combatants: Combatant[];
  round: number;
  /** Index of the combatant whose turn it is. */
  turn: number;
}

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
  z.object({
    ...base,
    type: z.literal('initiative'),
    combatants: z.array(combatantSchema).max(MAX_COMBATANTS).default([]),
    round: z.number().int().min(1).max(999).default(1),
    turn: z.number().int().min(0).max(MAX_COMBATANTS).default(0),
  }),
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
