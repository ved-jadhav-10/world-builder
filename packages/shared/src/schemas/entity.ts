import { z } from 'zod';
import { dayNumberSchema } from './calendar';
import { idSchema, visibilitySchema } from './common';

/** A TipTap/ProseMirror document. Node contents are re-validated by the editor schema on render. */
export const richTextDocSchema = z.looseObject({
  type: z.literal('doc'),
  content: z.array(z.unknown()).optional(),
});
export type RichTextDoc = z.infer<typeof richTextDocSchema>;

const nameSchema = z.string().trim().min(1, 'Name is required').max(200);
const aliasesSchema = z.array(z.string().trim().min(1).max(200)).max(50);

/** Born/died, founded/fallen, begins/ends: in-world day numbers, see calendar.ts. */
const entityDateRange = (value: { startDay?: number | null; endDay?: number | null }) =>
  value.startDay == null || value.endDay == null || value.endDay >= value.startDay;
const dateRangeIssue = { path: ['endDay'], message: 'The end cannot come before the start' };

/**
 * The books an entry belongs to. Empty means it is shared across the whole series; otherwise it
 * is for those books only (one book, or a few that form a series of their own).
 */
const scopeSchema = z.array(idSchema).max(50);

export const entityCreateSchema = z
  .object({
    typeId: idSchema,
    name: nameSchema,
    aliases: aliasesSchema.default([]),
    summary: z.string().trim().max(2000).default(''),
    /** Validated against the entity type's field schema on the server. */
    fields: z.record(z.string(), z.unknown()).default({}),
    body: richTextDocSchema.nullable().default(null),
    visibility: visibilitySchema.default('gm'),
    startDay: dayNumberSchema.nullable().default(null),
    endDay: dayNumberSchema.nullable().default(null),
    scopeBookIds: scopeSchema.default([]),
  })
  .refine(entityDateRange, dateRangeIssue);
export type EntityCreateInput = z.input<typeof entityCreateSchema>;

export const entityUpdateSchema = z
  .object({
    name: nameSchema.optional(),
    aliases: aliasesSchema.optional(),
    summary: z.string().trim().max(2000).optional(),
    fields: z.record(z.string(), z.unknown()).optional(),
    body: richTextDocSchema.nullable().optional(),
    visibility: visibilitySchema.optional(),
    startDay: dayNumberSchema.nullable().optional(),
    endDay: dayNumberSchema.nullable().optional(),
    scopeBookIds: scopeSchema.optional(),
  })
  .refine(entityDateRange, dateRangeIssue);
export type EntityUpdateInput = z.input<typeof entityUpdateSchema>;

export const ENTITY_SORTS = ['name', 'updated'] as const;
export type EntitySort = (typeof ENTITY_SORTS)[number];

export const entityListQuerySchema = z.object({
  typeId: idSchema.optional(),
  tagId: idSchema.optional(),
  /** Entries usable in this book: the shared ones and those scoped to it. */
  bookId: idSchema.optional(),
  /** Only entries with exactly this visibility; people who cannot see it get nothing. */
  visibility: visibilitySchema.optional(),
  sort: z.enum(ENTITY_SORTS).default('name'),
  cursor: z.string().max(500).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});
export type EntityListQuery = z.input<typeof entityListQuerySchema>;

export const searchQuerySchema = z.object({
  q: z.string().trim().min(1).max(200),
  typeId: idSchema.optional(),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});
export type SearchQuery = z.input<typeof searchQuerySchema>;

/** How many entries one bulk edit can touch. */
export const MAX_BULK_ENTRIES = 200;

const bulkIds = z.array(idSchema).min(1, 'Pick at least one entry').max(MAX_BULK_ENTRIES);

/** One change applied to many entries at once. */
export const bulkEntitySchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('visibility'), ids: bulkIds, visibility: visibilitySchema }),
  z.object({ action: z.literal('add_tag'), ids: bulkIds, tagId: idSchema }),
  z.object({ action: z.literal('remove_tag'), ids: bulkIds, tagId: idSchema }),
  z.object({ action: z.literal('trash'), ids: bulkIds }),
]);
export type BulkEntityInput = z.input<typeof bulkEntitySchema>;

/** `skipped` counts ids that are not live entries of this world (already trashed, or unknown). */
export interface BulkEntityResult {
  updated: number;
  skipped: number;
}
