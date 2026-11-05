import { z } from 'zod';
import { idSchema, visibilitySchema } from './common';

export const MAX_TABLE_ROWS = 500;
export const MAX_ROW_TEXT = 500;
export const MAX_ROW_WEIGHT = 10_000;
/** Chained tables (`{{Other table}}`) are followed this deep, then left as plain text. */
export const MAX_CHAIN_DEPTH = 4;
/** The log keeps this many rolls per world; older ones are dropped as new ones arrive. */
export const ROLL_LOG_LIMIT = 500;

export const tableRowInputSchema = z.object({
  weight: z.number().int().min(1).max(MAX_ROW_WEIGHT),
  text: z.string().trim().min(1, 'A row needs some text').max(MAX_ROW_TEXT),
});
export type TableRowInput = z.infer<typeof tableRowInputSchema>;

const nameSchema = z.string().trim().min(1, 'Give the table a name').max(120);

export const rollTableCreateSchema = z.object({
  name: nameSchema,
  description: z.string().trim().max(1000).default(''),
  visibility: visibilitySchema.default('gm'),
  rows: z.array(tableRowInputSchema).max(MAX_TABLE_ROWS).default([]),
});
export type RollTableCreateInput = z.input<typeof rollTableCreateSchema>;

/** Sending `rows` replaces all of them, in the order given. */
export const rollTableUpdateSchema = z.object({
  name: nameSchema.optional(),
  description: z.string().trim().max(1000).optional(),
  visibility: visibilitySchema.optional(),
  rows: z.array(tableRowInputSchema).max(MAX_TABLE_ROWS).optional(),
});
export type RollTableUpdateInput = z.input<typeof rollTableUpdateSchema>;

/** Who sees a roll afterwards: only the GM, or the players too. */
export const ROLL_VISIBILITIES = ['gm', 'player'] as const;
export const rollVisibilitySchema = z.enum(ROLL_VISIBILITIES);
export type RollVisibility = z.infer<typeof rollVisibilitySchema>;

export const diceRollSchema = z.object({
  expression: z.string().trim().min(1, 'Type a roll, such as 2d6+3').max(200),
  visibility: rollVisibilitySchema.default('gm'),
});
export type DiceRollInput = z.input<typeof diceRollSchema>;

export const tableRollSchema = z.object({ visibility: rollVisibilitySchema.default('gm') });
export type TableRollInput = z.input<typeof tableRollSchema>;

export const rollLogQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(200).default(50),
});

export const tableParamsSchema = z.object({ worldId: idSchema, id: idSchema });
