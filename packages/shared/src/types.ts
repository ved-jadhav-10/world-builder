import type { FeatureKind, FeatureSize, LineStyle, MapPoint, MapStatus } from './schemas/atlas';
import type { CalendarDef } from './schemas/calendar';
import type { NodeKind } from './schemas/manuscript';
import type { ProgressionChanges } from './schemas/progression';
import type { Role, Visibility } from './schemas/common';
import type { FieldDefinition } from './schemas/entity-type';
import type { RichTextDoc } from './schemas/entity';
import type { InviteRole } from './schemas/member';

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
  /** What this type's two dates are called: Born and Died, Founded and Fallen… */
  startLabel: string;
  endLabel: string;
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
  /** In-world day numbers (see calendar.ts); null when not dated. */
  startDay: number | null;
  endDay: number | null;
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
  /** When the link holds, as in-world day numbers; null = no limit on that side. */
  validFromDay: number | null;
  validToDay: number | null;
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
  /** Book > part > chapter > scene, flat with parent links; scenes include their text. */
  manuscript: (ManuscriptNode & { body: RichTextDoc | null })[];
  /** Map details and everything drawn on them. The map images themselves are not included. */
  atlas: { maps: AtlasMap[]; features: MapFeature[] };
  /** The world's calendar, or null if it still uses the default one. */
  calendar: { name: string; definition: CalendarDef } | null;
  progressions: Progression[];
  /** Details of every gallery image. The image files themselves are not included. */
  gallery: GalleryImage[];
}

export interface ApiErrorBody {
  error: string;
  message: string;
  issues?: { path: string; message: string }[];
}

// ---- Manuscript -----------------------------------------------------------

export interface ManuscriptNode {
  id: string;
  kind: NodeKind;
  parentId: string | null;
  title: string;
  summary: string;
  sortOrder: number;
  /** Scenes carry their own count; other nodes hold the total of everything beneath them. */
  wordCount: number;
  povId: string | null;
  locationId: string | null;
  /** Free text, such as "the morning after the storm". */
  inWorldDate: string;
  /** The scene's date as a day number in the world's calendar. */
  inWorldDay: number | null;
  updatedAt: string;
}

export interface Scene extends ManuscriptNode {
  kind: 'scene';
  body: RichTextDoc | null;
}

/** Everything a writer needs to highlight and preview mentions in the editor. */
export interface MentionIndexEntry {
  id: string;
  name: string;
  aliases: string[];
  typeId: string;
  summary: string;
}

export interface Appearance {
  sceneId: string;
  sceneTitle: string;
  chapterTitle: string | null;
  bookTitle: string | null;
  mentions: number;
  asPov: boolean;
  asLocation: boolean;
}

// ---- Atlas ----------------------------------------------------------------

/** The entry a map or feature points at. Trashed entries read as null. */
export interface MapEntityRef {
  id: string;
  name: string;
  typeId: string;
  summary: string;
}

export interface AtlasMap {
  id: string;
  /** The bigger map this one sits inside. */
  parentId: string | null;
  name: string;
  description: string;
  /** Tiles are cut in the background after an upload; the map opens once this is "ready". */
  status: MapStatus;
  /** Why tiling failed, when it did. */
  error: string;
  width: number;
  height: number;
  /** The entry this map shows, such as the Location it covers. */
  entityId: string | null;
  entity: MapEntityRef | null;
  visibility: Visibility;
  featureCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface MapFeature {
  id: string;
  mapId: string;
  kind: FeatureKind;
  /** Fractions of the map's width and height, from the top-left corner. */
  points: MapPoint[];
  label: string;
  notes: string;
  entityId: string | null;
  entity: MapEntityRef | null;
  /** Another map this feature opens. */
  linkMapId: string | null;
  icon: string | null;
  color: string | null;
  size: FeatureSize;
  lineStyle: LineStyle;
  /** Zoom levels in from the whole-map view before this feature appears. */
  minZoom: number;
  visibility: Visibility;
  updatedAt: string;
}

/** Where an entry shows up in the Atlas. */
export interface EntityMapLink {
  mapId: string;
  mapName: string;
  /** Null when the map itself shows this entry rather than a feature on it. */
  featureId: string | null;
  kind: FeatureKind | null;
}

export interface AtlasSearchResult {
  /** The map's ID, or the feature's ID. */
  id: string;
  mapId: string;
  mapName: string;
  featureId: string | null;
  kind: 'map' | FeatureKind;
  label: string;
}

// ---- Calendar, progressions and the timeline ------------------------------------------------

export interface Calendar {
  name: string;
  definition: CalendarDef;
  /** True until the world saves a calendar of its own. */
  isDefault: boolean;
  updatedAt: string | null;
}

/** A change to an entry that takes effect at a scene (reading order) or an in-world day. */
export interface Progression {
  id: string;
  entityId: string;
  title: string;
  note: string;
  /** Exactly one of these is set, unless the scene it pointed at has been deleted. */
  sceneId: string | null;
  day: number | null;
  changes: ProgressionChanges;
  visibility: Visibility;
  createdAt: string;
  updatedAt: string;
}

/** An entry with at least one date. With only one date it is a single point in time. */
export interface TimelineEntity {
  id: string;
  typeId: string;
  name: string;
  startDay: number | null;
  endDay: number | null;
}

export interface TimelineScene {
  id: string;
  title: string;
  day: number;
  chapterTitle: string | null;
  bookTitle: string | null;
}

/** Everything with a date, for the timeline. */
export interface TimelineData {
  entities: TimelineEntity[];
  scenes: TimelineScene[];
}

// ---- Galleries and quests ---------------------------------------------------------------------

export interface GalleryImage {
  id: string;
  /** The entry this image belongs to; null for the world's own gallery. */
  entityId: string | null;
  entityName: string | null;
  caption: string;
  visibility: Visibility;
  /** An appearance tagged to a scene or an in-world day (at most one is set). */
  sceneId: string | null;
  day: number | null;
  /** The entry's main picture. At most one image per entry. */
  isPortrait: boolean;
  width: number;
  height: number;
  bytes: number;
  createdAt: string;
}

// ---- Members and invites ----------------------------------------------------------------------

export interface Member {
  userId: string;
  name: string;
  email: string;
  role: Role;
  joinedAt: string;
}

export type InviteStatus = 'active' | 'expired' | 'used_up';

/** An invite link as the owner sees it. The secret is only ever shown when the link is made. */
export interface Invite {
  id: string;
  role: InviteRole;
  label: string;
  uses: number;
  /** Null = unlimited. */
  maxUses: number | null;
  /** Null = never. */
  expiresAt: string | null;
  status: InviteStatus;
  createdAt: string;
}

export interface CreatedInvite extends Invite {
  /** The secret part of the link, `/join/<token>`. It cannot be read again. */
  token: string;
}

/** What someone sees before deciding to join. Anyone holding the link may read it. */
export interface InvitePreview {
  worldName: string;
  role: InviteRole;
  invitedBy: string;
}

export interface JoinResult {
  world: World;
  /** False when the person was already a member, which leaves their role alone. */
  joined: boolean;
}

export interface QuestSummary {
  id: string;
  name: string;
  summary: string;
  /** One of QUEST_STATUSES; anything else (or nothing) counts as "Not started". */
  status: string;
  visibility: Visibility;
  updatedAt: string;
  /** What the quest is linked to: where it happens, who gave it, who it involves. */
  links: { label: string; other: { id: string; name: string; typeId: string } }[];
}
