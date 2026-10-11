import { z } from 'zod';
import { dayNumberSchema } from './calendar';
import { idSchema, visibilitySchema } from './common';

export const MAX_IMAGE_BYTES = 25 * 1024 * 1024;
export const MAX_IMAGE_PIXELS = 100_000_000;
/** Uploads are shrunk to fit inside this square, and re-saved as WebP. */
export const MAX_IMAGE_SIDE = 4096;
export const THUMBNAIL_SIDE = 480;

/** Empty form fields arrive as ''; treat them as "none". */
const optionalId = z.preprocess(
  (v) => (v === '' || v === undefined ? null : v),
  idSchema.nullable(),
);

const captionSchema = z.string().trim().max(300);

/** The text fields sent alongside the file when uploading an image (a multipart form). */
export const imageCreateSchema = z
  .object({
    /** The entry this image belongs to; none puts it in the world's own gallery. */
    entityId: optionalId,
    caption: captionSchema.default(''),
    visibility: visibilitySchema.default('gm'),
    /** An appearance can be tagged to a scene (reading order) or an in-world day. */
    sceneId: optionalId,
    day: z.preprocess(
      (v) => (v === '' || v === undefined || v === null ? null : Number(v)),
      dayNumberSchema.nullable(),
    ),
    /** Make this the entry's main portrait. */
    portrait: z.preprocess((v) => v === true || v === 'true', z.boolean()),
  })
  .refine((image) => image.sceneId === null || image.day === null, {
    path: ['day'],
    message: 'Tag it to a scene or a date, not both',
  });
export type ImageCreateInput = z.input<typeof imageCreateSchema>;

export const imageUpdateSchema = z.object({
  caption: captionSchema.optional(),
  visibility: visibilitySchema.optional(),
  entityId: idSchema.nullable().optional(),
  sceneId: idSchema.nullable().optional(),
  day: dayNumberSchema.nullable().optional(),
  portrait: z.boolean().optional(),
});
export type ImageUpdateInput = z.input<typeof imageUpdateSchema>;

export const imageListQuerySchema = z.object({
  entityId: idSchema.optional(),
  /** "world" lists only images that belong to no entry. */
  scope: z.enum(['world']).optional(),
});
export type ImageListQuery = z.input<typeof imageListQuerySchema>;

export const imageParamsSchema = z.object({ worldId: idSchema, id: idSchema });

// ---- Quests ---------------------------------------------------------------------------------

/** Quests are entries of the built-in "quest" type; their `status` field says where they stand. */
export const QUEST_TYPE_KEY = 'quest';
export const QUEST_STATUS_FIELD = 'status';
export const QUEST_STATUSES = ['Not started', 'Ongoing', 'Completed', 'Abandoned'] as const;
export type QuestStatus = (typeof QUEST_STATUSES)[number];
