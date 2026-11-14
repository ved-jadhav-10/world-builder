import { createHmac, randomBytes, scrypt as scryptCallback, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import { and, asc, eq, isNull, or } from 'drizzle-orm';
import {
  applyProgressions,
  buildSceneIndex,
  chapterLabel,
  describeFieldValue,
  fieldSchemaFor,
  fieldValuesFor,
  isActiveAt,
  isRevealedToReader,
  placeProgression,
  readerPoint,
  READER_START,
  stripSecretBlocks,
  toStoryPoint,
  wikiChapters,
  type Progression,
  type SceneIndex,
  type StoryPoint,
  type WikiChapter,
  type WikiEntry,
  type WikiEntryCard,
  type WikiHome,
  type WikiProgress,
  type WikiSettings,
  type WikiSettingsInput,
} from '@atlas/shared';
import type { DbOrTx } from '../../db/client';
import {
  entities,
  entityTypes,
  images,
  progressions,
  relationships,
  relationshipTypes,
  worlds,
} from '../../db/schema';
import { env } from '../../env';
import { notFound } from '../../errors';
import { listTree } from '../manuscript/service';

/*
 * The reader wiki's server side. Everything a visitor sees is what the "public" audience sees,
 * worked out at the point in the book the visitor says they have reached (packages/shared
 * wiki.ts). Scene ids, chapter contents and anything not public never leave this module.
 */

const scrypt = promisify(scryptCallback) as (
  password: string,
  salt: Buffer,
  keylen: number,
) => Promise<Buffer>;

type WorldRow = typeof worlds.$inferSelect;

export async function hashWikiPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const key = await scrypt(password, salt, 32);
  return `${salt.toString('hex')}:${key.toString('hex')}`;
}

export async function checkWikiPassword(password: string, stored: string): Promise<boolean> {
  const [saltHex, keyHex] = stored.split(':');
  if (!saltHex || !keyHex) return false;
  const expected = Buffer.from(keyHex, 'hex');
  const given = await scrypt(password, Buffer.from(saltHex, 'hex'), expected.length);
  return timingSafeEqual(given, expected);
}

const PASS_DAYS = 30;

/**
 * A pass for a password-protected wiki, kept in a cookie. It is signed with the server's secret
 * and with the password's hash, so changing the password ends every pass handed out before.
 */
export function signWikiPass(world: WorldRow, now = Date.now()): string {
  const expires = now + PASS_DAYS * 86_400_000;
  return `${expires}.${passSignature(world, expires)}`;
}

function passSignature(world: WorldRow, expires: number): string {
  return createHmac('sha256', env.BETTER_AUTH_SECRET)
    .update(`wiki:${world.id}:${world.wikiPasswordHash ?? ''}:${expires}`)
    .digest('hex');
}

export function wikiPassValid(world: WorldRow, pass: string | undefined, now = Date.now()) {
  if (!pass) return false;
  const [expiresText, signature] = pass.split('.');
  const expires = Number(expiresText);
  if (!signature || !Number.isFinite(expires) || expires < now) return false;
  const expected = Buffer.from(passSignature(world, expires));
  const given = Buffer.from(signature);
  return given.length === expected.length && timingSafeEqual(given, expected);
}

export const wikiPassSeconds = PASS_DAYS * 86_400;

/* Settings, for the owner and co-GMs. */

function toSettings(world: WorldRow): WikiSettings {
  return {
    enabled: world.wikiEnabled,
    intro: world.wikiIntro,
    showChapterTitles: world.wikiShowChapterTitles,
    hasPassword: world.wikiPasswordHash !== null,
    available: env.publicWikis,
  };
}

async function worldRow(db: DbOrTx, worldId: string): Promise<WorldRow> {
  const [row] = await db
    .select()
    .from(worlds)
    .where(and(eq(worlds.id, worldId), isNull(worlds.deletedAt)));
  if (!row) throw notFound('World');
  return row;
}

export async function getWikiSettings(db: DbOrTx, worldId: string): Promise<WikiSettings> {
  return toSettings(await worldRow(db, worldId));
}

export async function updateWikiSettings(
  db: DbOrTx,
  worldId: string,
  input: WikiSettingsInput,
): Promise<WikiSettings> {
  await worldRow(db, worldId);
  const password =
    input.password === undefined
      ? {}
      : { wikiPasswordHash: input.password === '' ? null : await hashWikiPassword(input.password) };
  const [row] = await db
    .update(worlds)
    .set({
      ...(input.enabled === undefined ? {} : { wikiEnabled: input.enabled }),
      ...(input.intro === undefined ? {} : { wikiIntro: input.intro }),
      ...(input.showChapterTitles === undefined
        ? {}
        : { wikiShowChapterTitles: input.showChapterTitles }),
      ...password,
    })
    .where(eq(worlds.id, worldId))
    .returning();
  return toSettings(row!);
}

/* Reading. */

/** The world behind a wiki address, or "not found" when it has no wiki (or wikis are off). */
export async function wikiWorld(db: DbOrTx, slug: string): Promise<WorldRow> {
  if (!env.publicWikis) throw notFound('Wiki');
  const [row] = await db
    .select()
    .from(worlds)
    .where(and(eq(worlds.slug, slug), isNull(worlds.deletedAt), eq(worlds.wikiEnabled, true)));
  if (!row) throw notFound('Wiki');
  return row;
}

/** Past every scene and every date: the point of someone who has read it all. */
const THE_END: StoryPoint = { sceneIndex: Number.MAX_SAFE_INTEGER, day: Number.MAX_SAFE_INTEGER };

interface Book {
  chapters: WikiChapter[];
  scenes: SceneIndex;
  /** Null at the end of the book. */
  reader: ReturnType<typeof readerPoint>;
  point: StoryPoint;
  progress: WikiProgress;
}

async function openBook(db: DbOrTx, worldId: string, progress: WikiProgress): Promise<Book> {
  const nodes = await listTree(db, worldId);
  const scenes = buildSceneIndex(nodes);
  const chapters = wikiChapters(nodes);
  const known =
    progress === READER_START ||
    progress === 'end' ||
    chapters.some((chapter) => chapter.id === progress);
  const safe = known ? progress : READER_START;
  const reader = readerPoint(safe, chapters, scenes);
  return {
    chapters,
    scenes,
    reader,
    point: reader ? toStoryPoint(reader) : THE_END,
    progress: safe,
  };
}

type TypeRow = typeof entityTypes.$inferSelect;
type EntityRow = typeof entities.$inferSelect;

interface Shelf {
  types: Map<string, TypeRow>;
  /** Entries the reader may see, each as it stands at their point in the book. */
  entries: Map<string, { row: EntityRow; state: ReturnType<typeof applyProgressions> }>;
}

function toProgression(row: typeof progressions.$inferSelect): Progression {
  return {
    id: row.id,
    entityId: row.entityId,
    title: row.title,
    note: row.note,
    sceneId: row.sceneId,
    day: row.day,
    changes: row.changes,
    visibility: row.visibility,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

/** Every public entry the reader has reached, resolved at their point. */
async function fillShelf(db: DbOrTx, worldId: string, book: Book): Promise<Shelf> {
  const [typeRows, entityRows, progressionRows] = await Promise.all([
    db.select().from(entityTypes).where(eq(entityTypes.worldId, worldId)),
    db
      .select()
      .from(entities)
      .where(
        and(
          eq(entities.worldId, worldId),
          isNull(entities.deletedAt),
          eq(entities.visibility, 'public'),
        ),
      ),
    db
      .select()
      .from(progressions)
      .where(and(eq(progressions.worldId, worldId), eq(progressions.visibility, 'public')))
      .orderBy(asc(progressions.createdAt)),
  ]);
  const types = new Map(typeRows.map((type) => [type.id, type]));
  const changes = new Map<string, Progression[]>();
  for (const row of progressionRows) {
    changes.set(row.entityId, [...(changes.get(row.entityId) ?? []), toProgression(row)]);
  }

  const entries: Shelf['entries'] = new Map();
  for (const row of entityRows) {
    if (!isRevealedToReader(row.revealNodeId, book.reader, book.chapters, book.scenes)) continue;
    const type = types.get(row.typeId);
    if (!type) continue;
    // GM-only fields are the author's: neither the values nor later changes to them are used.
    const own = (changes.get(row.id) ?? []).map((item) =>
      item.changes.fields
        ? {
            ...item,
            changes: {
              ...item.changes,
              fields: fieldValuesFor(type.fieldSchema, item.changes.fields, 'public'),
            },
          }
        : item,
    );
    const state = applyProgressions(
      {
        fields: fieldValuesFor(type.fieldSchema, row.fields, 'public'),
        summary: row.summary,
        name: row.name,
        aliases: row.aliases,
      },
      own,
      book.point,
      book.scenes,
    );
    entries.set(row.id, { row, state });
  }
  return { types, entries };
}

function toCard(entry: Shelf['entries'] extends Map<string, infer V> ? V : never, type: TypeRow) {
  const card: WikiEntryCard = {
    id: entry.row.id,
    typeKey: type.key,
    name: entry.state.name || entry.row.name,
    aliases: entry.state.aliases,
    summary: entry.state.summary,
  };
  return card;
}

export async function wikiHome(
  db: DbOrTx,
  world: WorldRow,
  progress: WikiProgress,
): Promise<WikiHome> {
  const book = await openBook(db, world.id, progress);
  const shelf = await fillShelf(db, world.id, book);
  const cards = [...shelf.entries.values()]
    .map((entry) => toCard(entry, shelf.types.get(entry.row.typeId)!))
    .sort((a, b) => a.name.localeCompare(b.name));
  const counts = new Map<string, number>();
  for (const card of cards) counts.set(card.typeKey, (counts.get(card.typeKey) ?? 0) + 1);
  const types = [...shelf.types.values()]
    .filter((type) => counts.has(type.key))
    .sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name))
    .map((type) => ({
      key: type.key,
      name: type.name,
      icon: type.icon,
      color: type.color,
      count: counts.get(type.key) ?? 0,
    }));
  return {
    world: {
      name: world.name,
      slug: world.slug,
      description: world.description,
      intro: world.wikiIntro,
    },
    chapters: book.chapters.map((chapter) => ({
      id: chapter.id,
      label: chapterLabel(chapter, world.wikiShowChapterTitles),
    })),
    progress: book.progress,
    types,
    entries: cards,
  };
}

export async function wikiEntry(
  db: DbOrTx,
  world: WorldRow,
  entryId: string,
  progress: WikiProgress,
): Promise<WikiEntry> {
  const book = await openBook(db, world.id, progress);
  const shelf = await fillShelf(db, world.id, book);
  const entry = shelf.entries.get(entryId);
  // Not public, not reached yet, or not there at all: the same answer for each.
  if (!entry) throw notFound('Entry');
  const type = shelf.types.get(entry.row.typeId)!;

  const fields = fieldSchemaFor(type.fieldSchema, 'public').flatMap((definition) => {
    const text = describeFieldValue(entry.state.fields[definition.key]);
    return text ? [{ key: definition.key, label: definition.label, text }] : [];
  });

  // Links, from both sides, to entries the reader can also see, as they stand at this point.
  const linkRows = await db
    .select({
      id: relationships.id,
      sourceId: relationships.sourceId,
      targetId: relationships.targetId,
      typeId: relationships.typeId,
      notes: relationships.notes,
      validFromDay: relationships.validFromDay,
      validToDay: relationships.validToDay,
    })
    .from(relationships)
    .where(
      and(
        eq(relationships.worldId, world.id),
        isNull(relationships.deletedAt),
        or(eq(relationships.sourceId, entryId), eq(relationships.targetId, entryId)),
      ),
    );
  const linkTypes = new Map(
    (await db.select().from(relationshipTypes).where(eq(relationshipTypes.worldId, world.id))).map(
      (linkType) => [linkType.id, linkType],
    ),
  );
  const links: WikiEntry['links'] = [];
  for (const link of linkRows) {
    const outgoing = link.sourceId === entryId;
    const other = shelf.entries.get(outgoing ? link.targetId : link.sourceId);
    if (!other) continue;
    // A change recorded on either entry may have ended or renamed the link by now.
    const change = { ...other.state.links.get(link.id), ...entry.state.links.get(link.id) };
    if (change.ended) continue;
    if (!isActiveAt(link.validFromDay, link.validToDay, book.reader ? book.point : null)) continue;
    const linkType = linkTypes.get(change.typeId ?? link.typeId);
    if (!linkType) continue;
    links.push({
      label: outgoing ? linkType.label : linkType.inverseLabel,
      notes: change.notes ?? link.notes,
      other: { id: other.row.id, name: other.state.name || other.row.name },
    });
  }
  links.sort((a, b) => a.label.localeCompare(b.label) || a.other.name.localeCompare(b.other.name));

  // Pictures tagged to a later scene or date wait until the reader gets there.
  const pictureRows = await db
    .select()
    .from(images)
    .where(
      and(
        eq(images.worldId, world.id),
        eq(images.entityId, entryId),
        eq(images.visibility, 'public'),
      ),
    )
    .orderBy(asc(images.createdAt));
  const pictures = pictureRows
    .filter(
      (image) =>
        (image.sceneId === null && image.day === null) ||
        placeProgression(image, book.point, book.scenes) === 'applied',
    )
    .sort((a, b) => Number(b.isPortrait) - Number(a.isPortrait))
    .map((image) => ({
      id: image.id,
      caption: image.caption,
      width: image.width,
      height: image.height,
      isPortrait: image.isPortrait,
    }));

  return {
    ...toCard(entry, type),
    type: { key: type.key, name: type.name, icon: type.icon, color: type.color },
    fields,
    body: stripSecretBlocks(entry.row.body),
    links,
    images: pictures,
  };
}

/** Proves a picture is public and belongs to this world's wiki before its file is sent. */
export async function wikiImageWorld(db: DbOrTx, world: WorldRow, imageId: string): Promise<void> {
  const [row] = await db
    .select({ id: images.id })
    .from(images)
    .innerJoin(entities, eq(entities.id, images.entityId))
    .where(
      and(
        eq(images.id, imageId),
        eq(images.worldId, world.id),
        eq(images.visibility, 'public'),
        eq(entities.visibility, 'public'),
        isNull(entities.deletedAt),
      ),
    );
  if (!row) throw notFound('Image');
}
