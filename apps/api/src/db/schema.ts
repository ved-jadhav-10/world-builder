import { sql } from 'drizzle-orm';
import {
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
import { ROLES, VISIBILITIES, type FieldDefinition, type RichTextDoc } from '@atlas/shared';
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
    createdBy: text('created_by').references(() => user.id, { onDelete: 'set null' }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
    deletedAt: deletedAt(),
  },
  (t) => [
    index('entities_world_type_idx').on(t.worldId, t.typeId),
    index('entities_world_deleted_idx').on(t.worldId, t.deletedAt),
    index('entities_search_idx').using('gin', t.searchVector),
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
