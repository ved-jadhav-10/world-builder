import { z } from 'zod';
import { PLOT_TEMPLATE_KEYS } from '../plot-templates';
import { colorSchema, idSchema } from './common';

export const MAX_PLOT_BOARDS = 20;
export const MAX_PLOT_BEATS = 40;
export const MAX_PLOT_THREADS = 20;
export const MAX_PLOT_CARDS = 1000;

export const plotBoardCreateSchema = z.object({
  name: z.string().trim().min(1, 'Give the board a name').max(120),
  /** The structure whose beats become the board's columns. */
  template: z.enum(PLOT_TEMPLATE_KEYS).default('three_act'),
});
export type PlotBoardCreateInput = z.input<typeof plotBoardCreateSchema>;

export const plotBoardUpdateSchema = z.object({
  name: z.string().trim().min(1, 'Give the board a name').max(120),
});

export const plotBeatSchema = z.object({
  title: z.string().trim().min(1, 'A beat needs a title').max(120),
  description: z.string().trim().max(1000).default(''),
});
export type PlotBeatInput = z.input<typeof plotBeatSchema>;
/** Written out rather than `.partial()`, which would keep the defaults and wipe what is not sent. */
export const plotBeatUpdateSchema = z.object({
  title: z.string().trim().min(1, 'A beat needs a title').max(120).optional(),
  description: z.string().trim().max(1000).optional(),
});

export const plotThreadSchema = z.object({
  name: z.string().trim().min(1, 'A storyline needs a name').max(80),
  color: colorSchema.default('#6366f1'),
});
export type PlotThreadInput = z.input<typeof plotThreadSchema>;
export const plotThreadUpdateSchema = z.object({
  name: z.string().trim().min(1, 'A storyline needs a name').max(80).optional(),
  color: colorSchema.optional(),
});

export const plotCardCreateSchema = z.object({
  beatId: idSchema,
  threadId: idSchema,
  title: z.string().trim().min(1, 'A card needs a title').max(200),
  text: z.string().trim().max(5000).default(''),
  /** The scene this card is about, if it has been written. */
  sceneId: idSchema.nullable().default(null),
  color: colorSchema.nullable().default(null),
});
export type PlotCardCreateInput = z.input<typeof plotCardCreateSchema>;

export const plotCardUpdateSchema = z.object({
  title: z.string().trim().min(1, 'A card needs a title').max(200).optional(),
  text: z.string().trim().max(5000).optional(),
  sceneId: idSchema.nullable().optional(),
  color: colorSchema.nullable().optional(),
});
export type PlotCardUpdateInput = z.input<typeof plotCardUpdateSchema>;

/** Where a card goes: a cell of the board, and its place among the cards already there. */
export const plotCardMoveSchema = z.object({
  beatId: idSchema,
  threadId: idSchema,
  index: z.number().int().min(0).max(MAX_PLOT_CARDS),
});
export type PlotCardMoveInput = z.input<typeof plotCardMoveSchema>;

/** The new order of the columns, the rows, or both. Each list must name every one exactly once. */
export const plotOrderSchema = z
  .object({
    beatIds: z.array(idSchema).max(MAX_PLOT_BEATS).optional(),
    threadIds: z.array(idSchema).max(MAX_PLOT_THREADS).optional(),
  })
  .refine((order) => order.beatIds !== undefined || order.threadIds !== undefined, {
    message: 'Send beatIds, threadIds or both',
  });
export type PlotOrderInput = z.input<typeof plotOrderSchema>;

export const plotParamsSchema = z.object({ worldId: idSchema, id: idSchema });
export const plotChildParamsSchema = z.object({
  worldId: idSchema,
  id: idSchema,
  childId: idSchema,
});
