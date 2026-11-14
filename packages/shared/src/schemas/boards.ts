import { z } from 'zod';
import { colorSchema, idSchema } from './common';

/** A canvas is for thinking with cards and arrows; a mood board is mostly pictures and colour. */
export const BOARD_KINDS = ['canvas', 'mood'] as const;
export type BoardKind = (typeof BOARD_KINDS)[number];

export const MAX_BOARDS = 100;
export const MAX_BOARD_ITEMS = 400;
export const MAX_BOARD_LINKS = 600;
export const MAX_BOARD_NOTE = 4_000;

/** Paper colours for notes. "plain" has no paper at all: just writing on the board. */
export const NOTE_COLORS = ['plain', 'vellum', 'rose', 'sage', 'sky', 'slate'] as const;
export type NoteColor = (typeof NOTE_COLORS)[number];

export const TEXT_SIZES = ['sm', 'md', 'lg'] as const;
export type TextSize = (typeof TEXT_SIZES)[number];

const coordinate = z.number().finite().min(-100_000).max(100_000);
const itemId = z.string().min(1).max(40);

const base = {
  id: itemId,
  x: coordinate,
  y: coordinate,
  w: z.number().finite().min(24).max(6_000),
  h: z.number().finite().min(24).max(6_000),
  /** Kept from players even when the board is shown to them. */
  gmOnly: z.boolean().default(false),
};

export const boardItemSchema = z.discriminatedUnion('type', [
  /** A card for an entry of the world. It always shows the entry as it is now. */
  z.object({ ...base, type: z.literal('entry'), entityId: idSchema }),
  z.object({
    ...base,
    type: z.literal('note'),
    text: z.string().max(MAX_BOARD_NOTE).default(''),
    color: z.enum(NOTE_COLORS).default('vellum'),
    size: z.enum(TEXT_SIZES).default('sm'),
  }),
  /** A picture from the world's gallery. */
  z.object({
    ...base,
    type: z.literal('image'),
    imageId: idSchema,
    caption: z.string().trim().max(200).default(''),
  }),
  /** A titled area that groups what lies inside it; moving it moves them. */
  z.object({ ...base, type: z.literal('frame'), title: z.string().trim().max(120).default('') }),
  z.object({
    ...base,
    type: z.literal('swatch'),
    color: colorSchema,
    label: z.string().trim().max(60).default(''),
  }),
  /** A link; music and video from services with a player can be played in place. */
  z.object({
    ...base,
    type: z.literal('embed'),
    url: z.url().max(2_000),
    title: z.string().trim().max(120).default(''),
  }),
]);
export type BoardItem = z.output<typeof boardItemSchema>;
export type BoardItemType = BoardItem['type'];

export const boardLinkSchema = z.object({
  id: itemId,
  from: itemId,
  to: itemId,
  label: z.string().trim().max(80).default(''),
});
export type BoardLink = z.output<typeof boardLinkSchema>;

export const boardDocSchema = z
  .object({
    items: z.array(boardItemSchema).max(MAX_BOARD_ITEMS).default([]),
    links: z.array(boardLinkSchema).max(MAX_BOARD_LINKS).default([]),
  })
  .superRefine((doc, ctx) => {
    const ids = new Set<string>();
    for (const item of doc.items) {
      if (ids.has(item.id)) {
        ctx.addIssue({ code: 'custom', path: ['items'], message: 'Two items share an ID' });
        return;
      }
      ids.add(item.id);
    }
    const linkIds = new Set<string>();
    for (const link of doc.links) {
      if (
        linkIds.has(link.id) ||
        !ids.has(link.from) ||
        !ids.has(link.to) ||
        link.from === link.to
      ) {
        ctx.addIssue({ code: 'custom', path: ['links'], message: 'An arrow points nowhere' });
        return;
      }
      linkIds.add(link.id);
    }
  });
export type BoardDoc = z.output<typeof boardDocSchema>;
export type BoardDocInput = z.input<typeof boardDocSchema>;

const nameSchema = z.string().trim().min(1, 'Give the board a name').max(120);

export const boardCreateSchema = z.object({
  name: nameSchema,
  kind: z.enum(BOARD_KINDS).default('canvas'),
});
export type BoardCreateInput = z.input<typeof boardCreateSchema>;

export const boardUpdateSchema = z
  .object({
    name: nameSchema.optional(),
    /** Show the board to players (without anything marked GM-only or hidden from them). */
    shared: z.boolean().optional(),
    doc: boardDocSchema.optional(),
    /** The version the edit was made on. Needed with `doc`, so two editors cannot overwrite. */
    baseVersion: z.number().int().min(0).optional(),
  })
  .refine((input) => input.doc === undefined || input.baseVersion !== undefined, {
    path: ['baseVersion'],
    message: 'Say which version this edit was made on',
  });
export type BoardUpdateInput = z.input<typeof boardUpdateSchema>;

export const boardParamsSchema = z.object({ worldId: idSchema, id: idSchema });
