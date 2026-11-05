import { sql } from 'drizzle-orm';
import {
  type AnyPgColumn,
  bigint,
  boolean,
  check,
  customType,
  date,
  foreignKey,
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
  REVISION_KINDS,
  ROLES,
  VISIBILITIES,
  type CalendarDef,
  type FieldDefinition,
  type GmWidget,
  type MapPoint,
  type MapScale,
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

/**
 * A link that lets whoever holds it join a world with a fixed role. Only a SHA-256 hash of the
 * secret is kept, so a leaked database does not leak working links. Cancelling deletes the row.
 */
export const worldInvites = pgTable(
  'world_invites',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    worldId: uuid('world_id')
      .notNull()
      .references(() => worlds.id, { onDelete: 'cascade' }),
    role: roleEnum('role').notNull(),
    label: text('label').notNull().default(''),
    tokenHash: text('token_hash').notNull().unique(),
    /** Null = unlimited. */
    maxUses: integer('max_uses'),
    uses: integer('uses').notNull().default(0),
    /** Null = never expires. */
    expiresAt: timestamp('expires_at', { withTimezone: true }),
    createdBy: text('created_by').references(() => user.id, { onDelete: 'set null' }),
    createdAt: createdAt(),
  },
  (t) => [
    index('world_invites_world_idx').on(t.worldId),
    // Whatever the code does, a link can never make an owner or be used past its limit.
    check('world_invites_not_owner_chk', sql`${t.role} <> 'owner'`),
    check('world_invites_uses_chk', sql`${t.maxUses} IS NULL OR ${t.uses} <= ${t.maxUses}`),
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
    /** Who can open the map; new maps are the GM's until revealed. */
    visibility: visibilityEnum('visibility').notNull().default('gm'),
    status: mapStatusEnum('status').notNull().default('processing'),
    error: text('error').notNull().default(''),
    width: integer('width').notNull(),
    height: integer('height').notNull(),
    /** Goes up when the image is replaced; tile URLs carry it so browsers drop old tiles. */
    imageVersion: integer('image_version').notNull().default(1),
    /** Distance scale and travel paces; null until the GM sets one. */
    scale: jsonb('scale').$type<MapScale>(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index('maps_world_idx').on(t.worldId),
    index('maps_parent_idx').on(t.parentId),
    index('maps_entity_idx').on(t.entityId),
  ],
);

/** A named group of features on one map (political, trade routes…) that can be switched off. */
export const mapLayers = pgTable(
  'map_layers',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    worldId: uuid('world_id')
      .notNull()
      .references(() => worlds.id, { onDelete: 'cascade' }),
    mapId: uuid('map_id')
      .notNull()
      .references(() => maps.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    visibleByDefault: boolean('visible_by_default').notNull().default(true),
    sortOrder: integer('sort_order').notNull().default(0),
    createdAt: createdAt(),
  },
  (t) => [index('map_layers_map_idx').on(t.mapId)],
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
    /** Prep notes only the GM is ever sent. */
    gmNotes: text('gm_notes').notNull().default(''),
    // Deleting a layer puts its features back on the base map rather than deleting them.
    layerId: uuid('layer_id').references(() => mapLayers.id, { onDelete: 'set null' }),
    entityId: uuid('entity_id').references(() => entities.id, { onDelete: 'set null' }),
    linkMapId: uuid('link_map_id').references(() => maps.id, { onDelete: 'set null' }),
    /** Null = take the linked entry's icon and colour. */
    icon: text('icon'),
    color: text('color'),
    size: featureSizeEnum('size').notNull().default('md'),
    lineStyle: lineStyleEnum('line_style').notNull().default('solid'),
    minZoom: integer('min_zoom').notNull().default(0),
    visibility: visibilityEnum('visibility').notNull().default('gm'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index('map_features_map_idx').on(t.mapId),
    index('map_features_world_idx').on(t.worldId),
    index('map_features_entity_idx').on(t.entityId),
    index('map_features_layer_idx').on(t.layerId),
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
    visibility: visibilityEnum('visibility').notNull().default('gm'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index('progressions_entity_idx').on(t.entityId),
    index('progressions_world_idx').on(t.worldId),
  ],
);

/**
 * Gallery images: a portrait or appearance of an entry (optionally tagged to a scene or an
 * in-world day), or a picture in the world's own gallery when `entityId` is null. The files are
 * kept in storage under the image's ID; uploads are re-saved as WebP at a bounded size.
 */
export const images = pgTable(
  'images',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    worldId: uuid('world_id')
      .notNull()
      .references(() => worlds.id, { onDelete: 'cascade' }),
    entityId: uuid('entity_id').references(() => entities.id, { onDelete: 'cascade' }),
    caption: text('caption').notNull().default(''),
    visibility: visibilityEnum('visibility').notNull().default('gm'),
    sceneId: uuid('scene_id').references(() => manuscriptNodes.id, { onDelete: 'set null' }),
    day: bigint('day', { mode: 'number' }),
    isPortrait: boolean('is_portrait').notNull().default(false),
    width: integer('width').notNull(),
    height: integer('height').notNull(),
    bytes: integer('bytes').notNull(),
    createdBy: text('created_by').references(() => user.id, { onDelete: 'set null' }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index('images_world_idx').on(t.worldId),
    index('images_entity_idx').on(t.entityId),
    // An entry has at most one portrait, whatever the code does.
    uniqueIndex('images_one_portrait_uq')
      .on(t.entityId)
      .where(sql`${t.isPortrait}`),
  ],
);

/** A rollable table. Its rows are in `roll_table_rows`; a row's weight sets how often it comes up. */
export const rollTables = pgTable(
  'roll_tables',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    worldId: uuid('world_id')
      .notNull()
      .references(() => worlds.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    description: text('description').notNull().default(''),
    visibility: visibilityEnum('visibility').notNull().default('gm'),
    createdBy: text('created_by').references(() => user.id, { onDelete: 'set null' }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  // Tables chain to each other by name, so a name means one table in a world.
  (t) => [uniqueIndex('roll_tables_world_name_uq').on(t.worldId, sql`lower(${t.name})`)],
);

export const rollTableRows = pgTable(
  'roll_table_rows',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tableId: uuid('table_id')
      .notNull()
      .references(() => rollTables.id, { onDelete: 'cascade' }),
    sortOrder: integer('sort_order').notNull(),
    weight: integer('weight').notNull().default(1),
    text: text('text').notNull(),
  },
  (t) => [
    index('roll_table_rows_table_idx').on(t.tableId, t.sortOrder),
    check('roll_table_rows_weight_chk', sql`${t.weight} >= 1`),
  ],
);

/** The roll log: the latest rolls in a world, newest first. Old ones are pruned as new arrive. */
export const rolls = pgTable(
  'rolls',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    worldId: uuid('world_id')
      .notNull()
      .references(() => worlds.id, { onDelete: 'cascade' }),
    userId: text('user_id').references(() => user.id, { onDelete: 'set null' }),
    kind: text('kind').notNull(),
    label: text('label').notNull(),
    summary: text('summary').notNull(),
    detail: jsonb('detail').$type<unknown>().notNull(),
    /** Only 'gm' or 'player'; the GM can show a roll to the table. */
    visibility: visibilityEnum('visibility').notNull().default('gm'),
    createdAt: createdAt(),
  },
  (t) => [
    index('rolls_world_created_idx').on(t.worldId, t.createdAt),
    check('rolls_kind_chk', sql`${t.kind} IN ('dice', 'table')`),
    check('rolls_visibility_chk', sql`${t.visibility} IN ('gm', 'player')`),
  ],
);

/** One GM's arrangement of widgets on their screen for a world (see `gmScreenSchema`). */
export const gmScreens = pgTable(
  'gm_screens',
  {
    worldId: uuid('world_id')
      .notNull()
      .references(() => worlds.id, { onDelete: 'cascade' }),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    widgets: jsonb('widgets').$type<GmWidget[]>().notNull().default([]),
    updatedAt: updatedAt(),
  },
  (t) => [primaryKey({ columns: [t.worldId, t.userId] })],
);

/** A plot board: beats as columns, storylines as rows, cards in the cells. The author's own. */
export const plotBoards = pgTable(
  'plot_boards',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    worldId: uuid('world_id')
      .notNull()
      .references(() => worlds.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    /** The structure it started from, for showing; the beats can be changed freely. */
    templateKey: text('template_key').notNull().default('blank'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index('plot_boards_world_idx').on(t.worldId)],
);

export const plotBeats = pgTable(
  'plot_beats',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    boardId: uuid('board_id')
      .notNull()
      .references(() => plotBoards.id, { onDelete: 'cascade' }),
    title: text('title').notNull(),
    description: text('description').notNull().default(''),
    sortOrder: integer('sort_order').notNull(),
  },
  (t) => [
    index('plot_beats_board_idx').on(t.boardId, t.sortOrder),
    // Lets a card point at "this beat of this board", so a card can never sit in another board's.
    uniqueIndex('plot_beats_board_id_uq').on(t.boardId, t.id),
  ],
);

export const plotThreads = pgTable(
  'plot_threads',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    boardId: uuid('board_id')
      .notNull()
      .references(() => plotBoards.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    color: text('color').notNull(),
    sortOrder: integer('sort_order').notNull(),
  },
  (t) => [
    index('plot_threads_board_idx').on(t.boardId, t.sortOrder),
    uniqueIndex('plot_threads_board_id_uq').on(t.boardId, t.id),
  ],
);

export const plotCards = pgTable(
  'plot_cards',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    boardId: uuid('board_id')
      .notNull()
      .references(() => plotBoards.id, { onDelete: 'cascade' }),
    beatId: uuid('beat_id').notNull(),
    threadId: uuid('thread_id').notNull(),
    title: text('title').notNull(),
    text: text('text').notNull().default(''),
    sceneId: uuid('scene_id').references(() => manuscriptNodes.id, { onDelete: 'set null' }),
    color: text('color'),
    /** Place within its cell, counted from 0. */
    sortOrder: integer('sort_order').notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index('plot_cards_board_idx').on(t.boardId),
    index('plot_cards_scene_idx').on(t.sceneId),
    // Deleting a beat or a storyline takes its cards with it.
    foreignKey({
      columns: [t.boardId, t.beatId],
      foreignColumns: [plotBeats.boardId, plotBeats.id],
    }).onDelete('cascade'),
    foreignKey({
      columns: [t.boardId, t.threadId],
      foreignColumns: [plotThreads.boardId, plotThreads.id],
    }).onDelete('cascade'),
  ],
);

/** Findings of the continuity checker that the author has said are intended. */
export const continuityDismissals = pgTable(
  'continuity_dismissals',
  {
    worldId: uuid('world_id')
      .notNull()
      .references(() => worlds.id, { onDelete: 'cascade' }),
    /** The finding's key, which changes if the facts behind it do. */
    key: text('key').notNull(),
    dismissedBy: text('dismissed_by').references(() => user.id, { onDelete: 'set null' }),
    createdAt: createdAt(),
  },
  (t) => [primaryKey({ columns: [t.worldId, t.key] })],
);

export const revisionKindEnum = pgEnum('revision_kind', REVISION_KINDS);

/**
 * A saved version of an entry or a scene. Exactly one of `entityId` and `nodeId` is set; the
 * snapshot in `content` is the whole of what restoring brings back.
 */
export const revisions = pgTable(
  'revisions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    worldId: uuid('world_id')
      .notNull()
      .references(() => worlds.id, { onDelete: 'cascade' }),
    entityId: uuid('entity_id').references(() => entities.id, { onDelete: 'cascade' }),
    nodeId: uuid('node_id').references(() => manuscriptNodes.id, { onDelete: 'cascade' }),
    kind: revisionKindEnum('kind').notNull(),
    label: text('label').notNull().default(''),
    content: jsonb('content').$type<Record<string, unknown>>().notNull(),
    /** Hash of `content`, so an unchanged save adds nothing. */
    contentHash: text('content_hash').notNull(),
    title: text('title').notNull().default(''),
    words: integer('words').notNull().default(0),
    createdBy: text('created_by').references(() => user.id, { onDelete: 'set null' }),
    createdAt: createdAt(),
  },
  (t) => [
    index('revisions_entity_idx').on(t.entityId, t.createdAt),
    index('revisions_node_idx').on(t.nodeId, t.createdAt),
    check('revisions_one_subject_chk', sql`num_nonnulls(${t.entityId}, ${t.nodeId}) = 1`),
  ],
);

/** One person's writing goals in one world. */
export const writingGoals = pgTable(
  'writing_goals',
  {
    worldId: uuid('world_id')
      .notNull()
      .references(() => worlds.id, { onDelete: 'cascade' }),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    dailyWords: integer('daily_words'),
    totalWords: integer('total_words'),
    deadline: date('deadline', { mode: 'string' }),
    /** The zone this person's days are counted in. */
    timezone: text('timezone').notNull().default('UTC'),
    updatedAt: updatedAt(),
  },
  (t) => [primaryKey({ columns: [t.worldId, t.userId] })],
);

/** Net words written by one person on one calendar day (in their own zone). */
export const writingDays = pgTable(
  'writing_days',
  {
    worldId: uuid('world_id')
      .notNull()
      .references(() => worlds.id, { onDelete: 'cascade' }),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    day: date('day', { mode: 'string' }).notNull(),
    words: integer('words').notNull().default(0),
  },
  (t) => [primaryKey({ columns: [t.worldId, t.userId, t.day] })],
);

/** A finished timed writing sprint. */
export const writingSprints = pgTable(
  'writing_sprints',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    worldId: uuid('world_id')
      .notNull()
      .references(() => worlds.id, { onDelete: 'cascade' }),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    minutes: integer('minutes').notNull(),
    words: integer('words').notNull(),
    createdAt: createdAt(),
  },
  (t) => [index('writing_sprints_user_idx').on(t.worldId, t.userId, t.createdAt)],
);
