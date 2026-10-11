import { z } from 'zod';
import { colorSchema, iconSchema, idSchema } from './common';

export const MAP_STATUSES = ['processing', 'ready', 'failed'] as const;
export type MapStatus = (typeof MAP_STATUSES)[number];

/** Pins link to entries and maps, labels are plain text, paths are roads/rivers, regions are areas. */
export const FEATURE_KINDS = ['pin', 'label', 'path', 'region'] as const;
export type FeatureKind = (typeof FEATURE_KINDS)[number];

export const FEATURE_KIND_LABELS: Record<FeatureKind, string> = {
  pin: 'Pin',
  label: 'Text label',
  path: 'Path',
  region: 'Region',
};

export const FEATURE_SIZES = ['sm', 'md', 'lg'] as const;
export type FeatureSize = (typeof FEATURE_SIZES)[number];

export const LINE_STYLES = ['solid', 'dashed', 'dotted'] as const;
export type LineStyle = (typeof LINE_STYLES)[number];

/** How many points each kind of feature takes. */
export const FEATURE_POINT_LIMITS: Record<FeatureKind, { min: number; max: number }> = {
  pin: { min: 1, max: 1 },
  label: { min: 1, max: 1 },
  path: { min: 2, max: 500 },
  region: { min: 3, max: 500 },
};

/** The deepest "show from" level offered: how many zooms in from the whole-map view. */
export const MAX_FEATURE_ZOOM = 6;

/** Map images are cut into square tiles of this many pixels per side. */
export const TILE_SIZE = 256;
/** Largest accepted upload: 200 MB, and 40,000 px along either side (1 gigapixel in total). */
export const MAX_MAP_BYTES = 200 * 1024 * 1024;
export const MAX_MAP_SIDE = 40_000;
export const MAX_MAP_PIXELS = 1_000_000_000;

/**
 * The deepest zoom level of a map's tile pyramid. Level 0 is the whole map in one tile;
 * each level up doubles the size until the last one is the image at full resolution.
 */
export function mapMaxZoom(width: number, height: number): number {
  return Math.max(0, Math.ceil(Math.log2(Math.max(width, height) / TILE_SIZE)));
}

/** Empty form fields arrive as ''; treat them as "none". */
const optionalId = z.preprocess(
  (v) => (v === '' || v === undefined ? null : v),
  idSchema.nullable(),
);

const mapNameSchema = z.string().trim().min(1, 'Name is required').max(120);
const mapDescriptionSchema = z.string().trim().max(2000);

/** The text fields sent alongside the image when uploading a map (multipart form). */
export const mapCreateSchema = z.object({
  name: mapNameSchema,
  description: mapDescriptionSchema.default(''),
  /** The bigger map this one sits inside, if any. */
  parentId: optionalId,
  /** The entry this map shows, such as a Location. */
  entityId: optionalId,
});
export type MapCreateInput = z.input<typeof mapCreateSchema>;

export const mapUpdateSchema = z.object({
  name: mapNameSchema.optional(),
  description: mapDescriptionSchema.optional(),
  parentId: idSchema.nullable().optional(),
  entityId: idSchema.nullable().optional(),
});
export type MapUpdateInput = z.input<typeof mapUpdateSchema>;

export const mapItemParamsSchema = z.object({ worldId: idSchema, id: idSchema });
export const featureParamsSchema = z.object({
  worldId: idSchema,
  id: idSchema,
  featureId: idSchema,
});
export const tileParamsSchema = z.object({
  worldId: idSchema,
  id: idSchema,
  z: z.coerce.number().int().min(0).max(32),
  x: z.coerce.number().int().min(0).max(1_000_000),
  y: z.coerce.number().int().min(0).max(1_000_000),
});

/** A position on a map as fractions of its width and height, so it survives any image size. */
export const pointSchema = z.tuple([z.number().min(0).max(1), z.number().min(0).max(1)]);
export type MapPoint = z.infer<typeof pointSchema>;

/** A message when `points` doesn't suit `kind`, otherwise null. */
export function pointCountProblem(kind: FeatureKind, points: readonly unknown[]): string | null {
  const { min, max } = FEATURE_POINT_LIMITS[kind];
  if (points.length >= min && points.length <= max) return null;
  const noun = min === max ? `${min} point` : `${min} to ${max} points`;
  return `A ${FEATURE_KIND_LABELS[kind].toLowerCase()} takes ${noun}`;
}

const featureLabelSchema = z.string().trim().max(120);
const featureNotesSchema = z.string().trim().max(5000);

export const featureCreateSchema = z
  .object({
    kind: z.enum(FEATURE_KINDS),
    points: z.array(pointSchema).min(1).max(500),
    label: featureLabelSchema.default(''),
    notes: featureNotesSchema.default(''),
    entityId: idSchema.nullable().default(null),
    /** Another map this feature opens. */
    linkMapId: idSchema.nullable().default(null),
    /** Null = use the linked entry's icon and colour. */
    icon: iconSchema.nullable().default(null),
    color: colorSchema.nullable().default(null),
    size: z.enum(FEATURE_SIZES).default('md'),
    lineStyle: z.enum(LINE_STYLES).default('solid'),
    minZoom: z.number().int().min(0).max(MAX_FEATURE_ZOOM).default(0),
  })
  .superRefine((feature, ctx) => {
    const problem = pointCountProblem(feature.kind, feature.points);
    if (problem) ctx.addIssue({ code: 'custom', path: ['points'], message: problem });
    if (feature.kind === 'label' && !feature.label) {
      ctx.addIssue({ code: 'custom', path: ['label'], message: 'A text label needs some text' });
    }
  });
export type FeatureCreateInput = z.input<typeof featureCreateSchema>;

/** The kind can't change; the service checks `points` against the stored kind. */
export const featureUpdateSchema = z.object({
  points: z.array(pointSchema).min(1).max(500).optional(),
  label: featureLabelSchema.optional(),
  notes: featureNotesSchema.optional(),
  entityId: idSchema.nullable().optional(),
  linkMapId: idSchema.nullable().optional(),
  icon: iconSchema.nullable().optional(),
  color: colorSchema.nullable().optional(),
  size: z.enum(FEATURE_SIZES).optional(),
  lineStyle: z.enum(LINE_STYLES).optional(),
  minZoom: z.number().int().min(0).max(MAX_FEATURE_ZOOM).optional(),
});
export type FeatureUpdateInput = z.input<typeof featureUpdateSchema>;

export const atlasSearchQuerySchema = z.object({
  q: z.string().trim().min(1).max(100),
  limit: z.coerce.number().int().min(1).max(50).default(10),
});
