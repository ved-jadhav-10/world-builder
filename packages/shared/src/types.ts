import type { Role, Visibility } from './schemas/common';
import type { FieldDefinition } from './schemas/entity-type';
import type { RichTextDoc } from './schemas/entity';

/** API response shapes. Dates are ISO strings. */

export interface World {
  id: string;
  name: string;
  slug: string;
  description: string;
  role: Role;
  createdAt: string;
  updatedAt: string;
}

export interface EntityType {
  id: string;
  key: string;
  name: string;
  icon: string;
  color: string;
  fieldSchema: FieldDefinition[];
  isBuiltin: boolean;
  sortOrder: number;
  entityCount: number;
}

export interface Tag {
  id: string;
  name: string;
  color: string;
}

export interface EntitySummary {
  id: string;
  typeId: string;
  name: string;
  aliases: string[];
  summary: string;
  visibility: Visibility;
  updatedAt: string;
}

export interface Entity extends EntitySummary {
  fields: Record<string, unknown>;
  body: RichTextDoc | null;
  tags: Tag[];
  createdAt: string;
}

export interface TrashedEntity extends EntitySummary {
  deletedAt: string;
}

export interface RelationshipType {
  id: string;
  key: string;
  label: string;
  inverseLabel: string;
  isBuiltin: boolean;
}

/** A relationship seen from one entity's side: incoming links read with the inverse label. */
export interface EntityRelationship {
  id: string;
  direction: 'outgoing' | 'incoming';
  typeId: string;
  label: string;
  notes: string;
  other: { id: string; name: string; typeId: string };
}

export interface SearchResult {
  id: string;
  typeId: string;
  name: string;
  aliases: string[];
  summary: string;
}

export interface Page<T> {
  items: T[];
  nextCursor: string | null;
}

export interface WorldExport {
  format: 'atlas-ink.world';
  version: 1;
  exportedAt: string;
  world: { id: string; name: string; slug: string; description: string; createdAt: string };
  entityTypes: Omit<EntityType, 'entityCount'>[];
  relationshipTypes: RelationshipType[];
  tags: Tag[];
  entities: (Omit<Entity, 'tags'> & { tagIds: string[] })[];
  relationships: {
    id: string;
    sourceId: string;
    targetId: string;
    typeId: string;
    notes: string;
    validFromDay: number | null;
    validToDay: number | null;
  }[];
}

export interface ApiErrorBody {
  error: string;
  message: string;
  issues?: { path: string; message: string }[];
}
