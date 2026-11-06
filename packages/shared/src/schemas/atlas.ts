import { z } from 'zod';
import { dayNumberSchema } from './calendar';
import { colorSchema, iconSchema, idSchema, visibilitySchema } from './common';

export const MAP_STATUSES = ['processing', 'ready', 'failed'] as const;
export type MapStatus = (typeof MAP_STATUSES)[number];

/**
 * Pins link to entries and maps, labels are plain text, paths are roads/rivers, regions are
 * areas, journeys are routes with dated stops, and arrows and circles are quick annotations.
 */
export const FEATURE_KINDS = [
  'pin',
  'label',
  'path',
  'region',
  'journey',
  'arrow',
  'circle',
] as const;
export type FeatureKind = (typeof FEATURE_KINDS)[number];

export const FEATURE_KIND_LABELS: Record<FeatureKind, string> = {
  pin: 'Pin',
  label: 'Text label',
  path: 'Path',
  region: 'Region',
  journey: 'Journey',
  arrow: 'Arrow',
  circle: 'Circle',
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
  journey: { min: 2, max: 500 },
  /** Tail and head. */
  arrow: { min: 2, max: 2 },
  /** Centre and a point on the edge. */
  circle: { min: 2, max: 2 },
};

/** Kinds drawn as a line through their points. */
export const LINE_KINDS: readonly FeatureKind[] = ['path', 'journey', 'arrow'];

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

/** How big a map is in the world, and how fast people cross it. */
export const travelModeSchema = z.object({
  name: z.string().trim().min(1, 'Name the way of travelling').max(24),
  perDay: z.number().positive('Must be more than zero').max(1_000_000),
});

export const mapScaleSchema = z.object({
  /** How many units the full width of the map covers. */
  width: z.number().positive('Must be more than zero').max(10_000_000),
  unit: z.string().trim().min(1, 'Name the unit').max(12),
  modes: z.array(travelModeSchema).max(8),
});

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
  /** Who can open the map. New maps are the GM's until revealed. */
  visibility: visibilitySchema.default('gm'),
});
export type MapCreateInput = z.input<typeof mapCreateSchema>;

/** A map with no picture of its own: a plain canvas to lay out places and roads on. */
export const BLANK_MAP_SHAPES = {
  square: { width: 2048, height: 2048 },
  wide: { width: 2560, height: 1600 },
  tall: { width: 1600, height: 2560 },
} as const;

export const blankMapSchema = z.object({
  name: mapNameSchema,
  description: mapDescriptionSchema.default(''),
  parentId: idSchema.nullable().default(null),
  entityId: idSchema.nullable().default(null),
  visibility: visibilitySchema.default('gm'),
  shape: z.enum(['square', 'wide', 'tall']).default('square'),
  /** The canvas colour. */
  background: colorSchema.default('#efe6d2'),
});
export type BlankMapInput = z.input<typeof blankMapSchema>;

/** A GeoJSON document of places, roads and areas to bring onto a map as items. */
export const geojsonImportSchema = z.object({
  geojson: z.unknown(),
  /** Latitude grows upward, so by default north stays at the top. Turn off for pixel coordinates. */
  flipY: z.boolean().default(true),
});
export type GeoJsonImportInput = z.input<typeof geojsonImportSchema>;

export const mapUpdateSchema = z.object({
  name: mapNameSchema.optional(),
  description: mapDescriptionSchema.optional(),
  parentId: idSchema.nullable().optional(),
  entityId: idSchema.nullable().optional(),
  visibility: visibilitySchema.optional(),
  /** Null removes the scale (and with it distances and travel times). */
  scale: mapScaleSchema.nullable().optional(),
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

const layerNameSchema = z.string().trim().min(1, 'Name is required').max(60);

export const layerCreateSchema = z.object({
  name: layerNameSchema,
  /** Whether the layer is switched on when the map opens. */
  visibleByDefault: z.boolean().default(true),
});
export type LayerCreateInput = z.input<typeof layerCreateSchema>;

export const layerUpdateSchema = z.object({
  name: layerNameSchema.optional(),
  visibleByDefault: z.boolean().optional(),
  sortOrder: z.number().int().min(0).max(10_000).optional(),
});
export type LayerUpdateInput = z.input<typeof layerUpdateSchema>;

export const layerParamsSchema = z.object({ worldId: idSchema, id: idSchema, layerId: idSchema });

const featureLabelSchema = z.string().trim().max(120);
const featureNotesSchema = z.string().trim().max(5000);
/** Prep notes for the GM; nobody else is sent them. */
const featureGmNotesSchema = z.string().trim().max(5000);

export const featureCreateSchema = z
  .object({
    kind: z.enum(FEATURE_KINDS),
    points: z.array(pointSchema).min(1).max(500),
    label: featureLabelSchema.default(''),
    notes: featureNotesSchema.default(''),
    gmNotes: featureGmNotesSchema.default(''),
    layerId: idSchema.nullable().default(null),
    entityId: idSchema.nullable().default(null),
    /** Another map this feature opens. */
    linkMapId: idSchema.nullable().default(null),
    /** Null = use the linked entry's icon and colour. */
    icon: iconSchema.nullable().default(null),
    color: colorSchema.nullable().default(null),
    size: z.enum(FEATURE_SIZES).default('md'),
    lineStyle: z.enum(LINE_STYLES).default('solid'),
    minZoom: z.number().int().min(0).max(MAX_FEATURE_ZOOM).default(0),
    /** For a journey: the in-world day at each stop, or null where a stop has no date. */
    pointDays: z.array(dayNumberSchema.nullable()).max(500).nullable().default(null),
    /** When the feature holds, as in-world days; an open end means no limit that side. */
    validFromDay: dayNumberSchema.nullable().default(null),
    validToDay: dayNumberSchema.nullable().default(null),
    /** Who can see it on the map. New pins are the GM's until revealed. */
    visibility: visibilitySchema.default('gm'),
  })
  .superRefine((feature, ctx) => {
    const problem = pointCountProblem(feature.kind, feature.points);
    if (problem) ctx.addIssue({ code: 'custom', path: ['points'], message: problem });
    if (feature.pointDays && feature.kind !== 'journey') {
      ctx.addIssue({
        code: 'custom',
        path: ['pointDays'],
        message: 'Only a journey has dated stops',
      });
    }
    if (feature.pointDays && feature.pointDays.length !== feature.points.length) {
      ctx.addIssue({
        code: 'custom',
        path: ['pointDays'],
        message: 'Give one date (or none) for each stop',
      });
    }
    if (
      feature.validFromDay !== null &&
      feature.validToDay !== null &&
      feature.validToDay < feature.validFromDay
    ) {
      ctx.addIssue({
        code: 'custom',
        path: ['validToDay'],
        message: 'The end cannot come before the start',
      });
    }
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
  gmNotes: featureGmNotesSchema.optional(),
  layerId: idSchema.nullable().optional(),
  entityId: idSchema.nullable().optional(),
  linkMapId: idSchema.nullable().optional(),
  icon: iconSchema.nullable().optional(),
  color: colorSchema.nullable().optional(),
  size: z.enum(FEATURE_SIZES).optional(),
  lineStyle: z.enum(LINE_STYLES).optional(),
  minZoom: z.number().int().min(0).max(MAX_FEATURE_ZOOM).optional(),
  pointDays: z.array(dayNumberSchema.nullable()).max(500).nullable().optional(),
  validFromDay: dayNumberSchema.nullable().optional(),
  validToDay: dayNumberSchema.nullable().optional(),
  visibility: visibilitySchema.optional(),
});
export type FeatureUpdateInput = z.input<typeof featureUpdateSchema>;

/** Listing a map's features can ask for those that hold on one in-world day. */
export const featureListQuerySchema = z.object({
  asOf: z.coerce.number().int().min(-1_000_000_000).max(1_000_000_000).optional(),
});

export const atlasSearchQuerySchema = z.object({
  q: z.string().trim().min(1).max(100),
  limit: z.coerce.number().int().min(1).max(50).default(10),
});
