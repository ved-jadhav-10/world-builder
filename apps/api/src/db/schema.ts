import { sql } from 'drizzle-orm';
import {
  type AnyPgColumn,
  bigint,
  boolean,
  customType,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import {
  FEATURE_KINDS,
  FEATURE_SIZES,
  LINE_STYLES,
  MAP_STATUSES,
  NODE_KINDS,
  ROLES,
  VISIBILITIES,
  type CalendarDef,
  type FieldDefinition,
  type MapPoint,
  type ProgressionChanges,
  type RichTextDoc,
} from '@atlas/shared';
import { user } from './auth-schema';

export * from './auth-schema';

const tsvector = customType<{ data: string }>({ dataType: () => 'tsvector' });

export const roleEnum = pgEnum('world_role', ROLES);
export const visibilityEnum = pgEnum('visibility', VISIBILITIES);

const createdAt = () => timestamp('created_at', { withTimezone: true }).notNull().defaultNow();
const updatedAt = () =>
  timestamp('updated_at', { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date());
const deletedAt = () => timestamp('deleted_at', { withTimezone: true });

export const worlds = pgTable('worlds', {
  id: uuid('id').primaryKey().defaultRandom(),
  ownerId: text('owner_id')
    .notNull()
    .references(() => user.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  slug: text('slug').notNull().unique(),
  description: text('description').notNull().default(''),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
  deletedAt: deletedAt(),
});

export const worldMembers = pgTable(
  'world_members',
  {
    worldId: uuid('world_id')
      .notNull()
      .references(() => worlds.id, { onDelete: 'cascade' }),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    role: roleEnum('role').notNull(),
    createdAt: createdAt(),
  },
  (t) => [
    primaryKey({ columns: [t.worldId, t.userId] }),
    index('world_members_user_idx').on(t.userId),
  ],
);

export const entityTypes = pgTable(
  'entity_types',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    worldId: uuid('world_id')
      .notNull()
      .references(() => worlds.id, { onDelete: 'cascade' }),
    key: text('key').notNull(),
    name: text('name').notNull(),
    icon: text('icon').notNull(),
    color: text('color').notNull(),
    fieldSchema: jsonb('field_schema').$type<FieldDefinition[]>().notNull().default([]),
    isBuiltin: boolean('is_builtin').notNull().default(false),
    sortOrder: integer('sort_order').notNull().default(0),
    /** What the entry's two dates are called for this type: Born and Died, Founded and Fallen… */
    startLabel: text('start_label').notNull().default('Starts'),
    endLabel: text('end_label').notNull().default('Ends'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [uniqueIndex('entity_types_world_key_uq').on(t.worldId, t.key)],
);

export const entities = pgTable(
  'entities',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    worldId: uuid('world_id')
      .notNull()
      .references(() => worlds.id, { onDelete: 'cascade' }),
    // Restrict: a type cannot be deleted while entities (including trashed ones) use it.
    typeId: uuid('type_id')
      .notNull()
      .references(() => entityTypes.id, { onDelete: 'restrict' }),
    name: text('name').notNull(),
    aliases: text('aliases')
      .array()
      .notNull()
      .default(sql`'{}'::text[]`),
    summary: text('summary').notNull().default(''),
    fields: jsonb('fields').$type<Record<string, unknown>>().notNull().default({}),
    body: jsonb('body').$type<RichTextDoc>(),
    /** Derived from name, aliases, summary, body and fields on every write. */
    searchText: text('search_text').notNull().default(''),
    searchVector: tsvector('search_vector').generatedAlwaysAs(
      sql`to_tsvector('simple'::regconfig, search_text)`,
    ),
    visibility: visibilityEnum('visibility').notNull().default('gm'),
    /** In-world day numbers (see calendars): born/died, founded/fallen, begins/ends. */
    startDay: bigint('start_day', { mode: 'number' }),
    endDay: bigint('end_day', { mode: 'number' }),
    createdBy: text('created_by').references(() => user.id, { onDelete: 'set null' }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
    deletedAt: deletedAt(),
  },
  (t) => [
    index('entities_world_type_idx').on(t.worldId, t.typeId),
    index('entities_world_deleted_idx').on(t.worldId, t.deletedAt),
    index('entities_search_idx').using('gin', t.searchVector),
    index('entities_world_start_idx').on(t.worldId, t.startDay),
  ],
);

export const relationshipTypes = pgTable(
  'relationship_types',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    worldId: uuid('world_id')
      .notNull()
      .references(() => worlds.id, { onDelete: 'cascade' }),
    key: text('key').notNull(),
    label: text('label').notNull(),
    inverseLabel: text('inverse_label').notNull(),
    isBuiltin: boolean('is_builtin').notNull().default(false),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex('relationship_types_world_key_uq').on(t.worldId, t.key)],
);

export const relationships = pgTable(
  'relationships',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    worldId: uuid('world_id')
      .notNull()
      .references(() => worlds.id, { onDelete: 'cascade' }),
    sourceId: uuid('source_id')
      .notNull()
      .references(() => entities.id, { onDelete: 'cascade' }),
    targetId: uuid('target_id')
      .notNull()
      .references(() => entities.id, { onDelete: 'cascade' }),
    typeId: uuid('type_id')
      .notNull()
      .references(() => relationshipTypes.id, { onDelete: 'restrict' }),
    notes: text('notes').notNull().default(''),
    /** In-world day numbers; set once custom calendars exist. */
    validFromDay: bigint('valid_from_day', { mode: 'number' }),
    validToDay: bigint('valid_to_day', { mode: 'number' }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
    deletedAt: deletedAt(),
  },
  (t) => [
    index('relationships_source_idx').on(t.sourceId),
    index('relationships_target_idx').on(t.targetId),
    index('relationships_world_idx').on(t.worldId),
  ],
);

export const tags = pgTable(
  'tags',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    worldId: uuid('world_id')
      .notNull()
      .references(() => worlds.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    color: text('color').notNull(),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex('tags_world_name_uq').on(t.worldId, sql`lower(${t.name})`)],
);

export const entityTags = pgTable(
  'entity_tags',
  {
    entityId: uuid('entity_id')
      .notNull()
      .references(() => entities.id, { onDelete: 'cascade' }),
    tagId: uuid('tag_id')
      .notNull()
      .references(() => tags.id, { onDelete: 'cascade' }),
  },
  (t) => [primaryKey({ columns: [t.entityId, t.tagId] }), index('entity_tags_tag_idx').on(t.tagId)],
);

export const nodeKindEnum = pgEnum('manuscript_node_kind', NODE_KINDS);

/** The manuscript tree: book > (part >) chapter > scene. Only scenes have a body. */
export const manuscriptNodes = pgTable(
  'manuscript_nodes',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    worldId: uuid('world_id')
      .notNull()
      .references(() => worlds.id, { onDelete: 'cascade' }),
    kind: nodeKindEnum('kind').notNull(),
    parentId: uuid('parent_id').references((): AnyPgColumn => manuscriptNodes.id, {
      onDelete: 'cascade',
    }),
    title: text('title').notNull(),
    summary: text('summary').notNull().default(''),
    sortOrder: integer('sort_order').notNull().default(0),
    body: jsonb('body').$type<RichTextDoc>(),
    /** Text of the body, one block per line; kept so mentions can be rescanned cheaply. */
    plainText: text('plain_text').notNull().default(''),
    wordCount: integer('word_count').notNull().default(0),
    povId: uuid('pov_id').references(() => entities.id, { onDelete: 'set null' }),
    locationId: uuid('location_id').references(() => entities.id, { onDelete: 'set null' }),
    inWorldDate: text('in_world_date').notNull().default(''),
    /** The same date as a day number in the world's calendar; the text above is a free note. */
    inWorldDay: bigint('in_world_day', { mode: 'number' }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index('manuscript_nodes_world_idx').on(t.worldId),
    index('manuscript_nodes_parent_idx').on(t.parentId, t.sortOrder),
  ],
);

/** Derived: which entities each scene mentions, by name or alias. Rebuilt on scene/entity edits. */
export const sceneMentions = pgTable(
  'scene_mentions',
  {
    sceneId: uuid('scene_id')
      .notNull()
      .references(() => manuscriptNodes.id, { onDelete: 'cascade' }),
    entityId: uuid('entity_id')
      .notNull()
      .references(() => entities.id, { onDelete: 'cascade' }),
    count: integer('count').notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.sceneId, t.entityId] }),
    index('scene_mentions_entity_idx').on(t.entityId),
  ],
);

export const mapStatusEnum = pgEnum('map_status', MAP_STATUSES);
export const featureKindEnum = pgEnum('map_feature_kind', FEATURE_KINDS);
export const featureSizeEnum = pgEnum('map_feature_size', FEATURE_SIZES);
export const lineStyleEnum = pgEnum('map_line_style', LINE_STYLES);

/**
 * An uploaded map image. Maps nest through `parentId` (world > region > city), which gives
 * the breadcrumbs. The image and its tiles live in file storage, under the map's ID.
 */
export const maps = pgTable(
  'maps',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    worldId: uuid('world_id')
      .notNull()
      .references(() => worlds.id, { onDelete: 'cascade' }),
    // Deleting a map lifts its child maps to the top level rather than deleting them.
    parentId: uuid('parent_id').references((): AnyPgColumn => maps.id, { onDelete: 'set null' }),
    /** The entry this map shows, such as the Location it covers. */
    entityId: uuid('entity_id').references(() => entities.id, { onDelete: 'set null' }),
    name: text('name').notNull(),
    description: text('description').notNull().default(''),
    status: mapStatusEnum('status').notNull().default('processing'),
    error: text('error').notNull().default(''),
    width: integer('width').notNull(),
    height: integer('height').notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index('maps_world_idx').on(t.worldId),
    index('maps_parent_idx').on(t.parentId),
    index('maps_entity_idx').on(t.entityId),
  ],
);

/** Pins, labels, paths and regions drawn on a map. Points are fractions of the map's size. */
export const mapFeatures = pgTable(
  'map_features',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    worldId: uuid('world_id')
      .notNull()
      .references(() => worlds.id, { onDelete: 'cascade' }),
    mapId: uuid('map_id')
      .notNull()
      .references(() => maps.id, { onDelete: 'cascade' }),
    kind: featureKindEnum('kind').notNull(),
    points: jsonb('points').$type<MapPoint[]>().notNull(),
    label: text('label').notNull().default(''),
    notes: text('notes').notNull().default(''),
    entityId: uuid('entity_id').references(() => entities.id, { onDelete: 'set null' }),
    linkMapId: uuid('link_map_id').references(() => maps.id, { onDelete: 'set null' }),
    /** Null = take the linked entry's icon and colour. */
    icon: text('icon'),
    color: text('color'),
    size: featureSizeEnum('size').notNull().default('md'),
    lineStyle: lineStyleEnum('line_style').notNull().default('solid'),
    minZoom: integer('min_zoom').notNull().default(0),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index('map_features_map_idx').on(t.mapId),
    index('map_features_world_idx').on(t.worldId),
    index('map_features_entity_idx').on(t.entityId),
  ],
);

/** A world's calendar. One per world; worlds without a row use the default calendar. */
export const calendars = pgTable('calendars', {
  id: uuid('id').primaryKey().defaultRandom(),
  worldId: uuid('world_id')
    .notNull()
    .unique()
    .references(() => worlds.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  definition: jsonb('definition').$type<CalendarDef>().notNull(),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

/**
 * A change to an entry that takes effect at a scene or on a day. If the scene is deleted the
 * progression is kept, but unplaced, rather than silently losing what the writer recorded.
 */
export const progressions = pgTable(
  'progressions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    worldId: uuid('world_id')
      .notNull()
      .references(() => worlds.id, { onDelete: 'cascade' }),
    entityId: uuid('entity_id')
      .notNull()
      .references(() => entities.id, { onDelete: 'cascade' }),
    title: text('title').notNull(),
    note: text('note').notNull().default(''),
    sceneId: uuid('scene_id').references(() => manuscriptNodes.id, { onDelete: 'set null' }),
    day: bigint('day', { mode: 'number' }),
    changes: jsonb('changes').$type<ProgressionChanges>().notNull().default({}),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index('progressions_entity_idx').on(t.entityId),
    index('progressions_world_idx').on(t.worldId),
  ],
);
