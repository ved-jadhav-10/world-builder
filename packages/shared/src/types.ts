import type { ContinuityFinding } from './continuity';
import type { GmWidget } from './schemas/gm-screen';
import type { DiceResult } from './dice';
import type { TableRollResult } from './tables';
import type { MapScale } from './map-tools';
import type { ManuscriptProgress, Streaks, WritingDay, WritingGoals } from './writing-stats';
import type { FeatureKind, FeatureSize, LineStyle, MapPoint, MapStatus } from './schemas/atlas';
import type { CalendarDef } from './schemas/calendar';
import type { NodeKind } from './schemas/manuscript';
import type { ProgressionChanges } from './schemas/progression';
import type { Role, Visibility } from './schemas/common';
import type { RevisionKind } from './schemas/revisions';
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
  atlas: { maps: AtlasMap[]; features: MapFeature[]; layers: MapLayer[] };
  /** The world's calendar, or null if it still uses the default one. */
  calendar: { name: string; definition: CalendarDef } | null;
  progressions: Progression[];
  /** Details of every gallery image. The image files themselves are not included. */
  gallery: GalleryImage[];
  /** Rollable tables with their rows. The roll log is not included. */
  rollTables: RollTable[];
  /** Plot boards with their beats, storylines and cards. */
  plotBoards: PlotBoard[];
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
  /** Goes up each time the image is replaced, so browsers fetch the new tiles. */
  imageVersion: number;
  /** What a distance on this map means; null until the GM sets one. */
  scale: MapScale | null;
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
  /** Prep notes; always empty for anyone but the GM. */
  gmNotes: string;
  /** The layer this belongs to, or null for the base map. */
  layerId: string | null;
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

/** A named group of pins, paths and regions on one map that can be switched on and off. */
export interface MapLayer {
  id: string;
  mapId: string;
  name: string;
  visibleByDefault: boolean;
  sortOrder: number;
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
  /** The addresses the link was sent to (sending happens in the background). */
  emailedTo: string[];
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

/** An entry that another entry is linked to, with the link's label read from that entry's side. */
export interface EntryLink {
  label: string;
  other: { id: string; name: string; typeId: string };
}

export interface SessionSummary {
  id: string;
  name: string;
  summary: string;
  /** The session's number; null if it was cleared. */
  number: number | null;
  /** One of SESSION_STATUSES; anything else counts as "Planned". */
  status: string;
  /** When it was played in the real world, as written. */
  playedOn: string;
  visibility: Visibility;
  updatedAt: string;
  /** What is in the session: the characters, places and quests it features. */
  links: EntryLink[];
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
  links: EntryLink[];
}

// ---- Dice, tables and the roll log --------------------------------------------------------------

export interface RollTableSummary {
  id: string;
  name: string;
  description: string;
  visibility: Visibility;
  rowCount: number;
  updatedAt: string;
}

export interface RollTable extends RollTableSummary {
  rows: { id: string; weight: number; text: string }[];
  createdAt: string;
}

/** One line of the roll log. `detail` is what was rolled, in full, for showing the dice. */
export type RollLogEntry = {
  id: string;
  /** Who is allowed to see it: the GM only, or the players too. */
  visibility: 'gm' | 'player';
  /** The expression rolled, or the table's name. */
  label: string;
  /** One line summing it up, such as `2d6+3 → [4, 2] +3 = 9`. */
  summary: string;
  rolledBy: { id: string; name: string } | null;
  createdAt: string;
} & ({ kind: 'dice'; detail: DiceResult } | { kind: 'table'; detail: TableRollResult });

// ---- The GM screen ------------------------------------------------------------------------------

export interface GmScreen {
  widgets: GmWidget[];
  /** The entries the pinned-entries widgets point to, still existing; trashed ones are left out. */
  entries: EntitySummary[];
}

// ---- The relationship graph and family trees ------------------------------------------------------

export interface GraphNode {
  id: string;
  name: string;
  typeId: string;
  /** How many of the links shown touch this entry. */
  degree: number;
}

export interface GraphEdge {
  id: string;
  sourceId: string;
  targetId: string;
  typeId: string;
  /** Read from the source: "parent of". The target sees `inverseLabel`: "child of". */
  label: string;
  inverseLabel: string;
  validFromDay: number | null;
  validToDay: number | null;
}

export interface GraphData {
  focusId: string | null;
  nodes: GraphNode[];
  edges: GraphEdge[];
  /** True when more entries were connected than fit, so the picture is partial. */
  truncated: boolean;
}

export interface FamilyData {
  focusId: string;
  people: { id: string; name: string; typeId: string }[];
  parentOf: { parentId: string; childId: string }[];
  spouses: [string, string][];
  siblings: [string, string][];
}

// ---- The plot board -----------------------------------------------------------------------------

export interface PlotBoardSummary {
  id: string;
  name: string;
  templateKey: string;
  beatCount: number;
  threadCount: number;
  cardCount: number;
  updatedAt: string;
}

/**
 * A grid: the beats are its columns, the storylines its rows, and a card sits in one cell.
 * Beats and threads come in order; cards come in order within their cell.
 */
export interface PlotBoard {
  id: string;
  name: string;
  templateKey: string;
  beats: { id: string; title: string; description: string }[];
  threads: { id: string; name: string; color: string }[];
  cards: {
    id: string;
    beatId: string;
    threadId: string;
    title: string;
    text: string;
    sceneId: string | null;
    color: string | null;
  }[];
  updatedAt: string;
}

// ---- The continuity checker ---------------------------------------------------------------------

export interface ContinuityReport {
  /** What is worth a look, warnings first. */
  findings: ContinuityFinding[];
  /** What the author said was intended. They can be brought back. */
  dismissed: ContinuityFinding[];
  /** Names for everything the findings mention. */
  entities: { id: string; name: string; typeId: string }[];
  scenes: { id: string; title: string }[];
  /** How each link reads, from its source: "spouse of". */
  linkLabels: Record<string, string>;
  /** How many of each there were to check, to say what was looked at. */
  checked: { entries: number; scenes: number; links: number };
}

/** One saved version of an entry or a scene, as listed in its history. */
export interface RevisionSummary {
  id: string;
  kind: RevisionKind;
  /** What the author called it; empty for automatic versions. */
  label: string;
  createdAt: string;
  /** Who made the edit this version holds; null if that person has left. */
  author: string | null;
  /** The entry's name or the scene's title at the time. */
  title: string;
  words: number;
}

/** What is kept of an entry in each version. Visibility is deliberately not part of it. */
export interface EntityRevisionContent {
  name: string;
  aliases: string[];
  summary: string;
  fields: Record<string, unknown>;
  body: RichTextDoc | null;
  startDay: number | null;
  endDay: number | null;
}

export interface SceneRevisionContent {
  title: string;
  summary: string;
  body: RichTextDoc | null;
}

export interface RevisionDetail<Content> extends RevisionSummary {
  content: Content;
}

export interface WritingSprint {
  id: string;
  minutes: number;
  words: number;
  createdAt: string;
}

/** Everything the writing goals page shows for one person in one world. */
export interface WritingStats {
  /** Today's date in the person's time zone, "YYYY-MM-DD". */
  today: string;
  timezone: string;
  goals: WritingGoals;
  /** Words written today (net of words cut). */
  todayWords: number;
  /** Words written in the last seven days, not counting days spent cutting. */
  weekWords: number;
  streaks: Streaks;
  /** Days with any recorded change, oldest first. */
  days: WritingDay[];
  /** Words in the manuscript now, across all scenes. */
  manuscriptWords: number;
  progress: ManuscriptProgress | null;
  sprints: WritingSprint[];
}
