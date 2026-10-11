import { randomUUID } from 'node:crypto';
import { mkdir, readFile, rename } from 'node:fs/promises';
import { and, asc, eq, getTableColumns, ilike, isNull, sql } from 'drizzle-orm';
import type { z } from 'zod';
import {
  mapMaxZoom,
  pointCountProblem,
  type AtlasMap,
  type AtlasSearchResult,
  type EntityMapLink,
  type featureCreateSchema,
  type featureUpdateSchema,
  type MapEntityRef,
  type MapFeature,
  type mapCreateSchema,
  type MapPoint,
  type mapUpdateSchema,
} from '@atlas/shared';
import type { DbOrTx } from '../../db/client';
import { entities, mapFeatures, maps } from '../../db/schema';
import { badRequest, conflict, notFound } from '../../errors';
import { getEntityRow } from '../entities/service';
import { mapDir, originalPath, removeMapFiles, thumbnailPath, tilePath } from './files';
import { enqueueTiling, type TilingLog } from './tiling';

type MapRow = typeof maps.$inferSelect;

/** The entry a row points at, joined in only while that entry isn't in the trash. */
const entityRefColumns = {
  refId: entities.id,
  refName: entities.name,
  refTypeId: entities.typeId,
  refSummary: entities.summary,
};
interface EntityRefColumns {
  refId: string | null;
  refName: string | null;
  refTypeId: string | null;
  refSummary: string | null;
}

function toEntityRef(row: EntityRefColumns): MapEntityRef | null {
  if (!row.refId) return null;
  return {
    id: row.refId,
    name: row.refName ?? '',
    typeId: row.refTypeId ?? '',
    summary: row.refSummary ?? '',
  };
}

const round = (n: number) => Math.round(n * 1_000_000) / 1_000_000;
const roundPoints = (points: MapPoint[]): MapPoint[] =>
  points.map(([x, y]) => [round(x), round(y)]);

// ---- Maps -----------------------------------------------------------------

function selectMaps(db: DbOrTx) {
  return db
    .select({
      map: getTableColumns(maps),
      featureCount: sql<number>`(select count(*)::int from ${mapFeatures} where ${mapFeatures.mapId} = ${maps.id})`,
      ...entityRefColumns,
    })
    .from(maps)
    .leftJoin(entities, and(eq(entities.id, maps.entityId), isNull(entities.deletedAt)));
}

function toMap(row: Awaited<ReturnType<typeof selectMaps>>[number]): AtlasMap {
  const { map } = row;
  return {
    id: map.id,
    parentId: map.parentId,
    name: map.name,
    description: map.description,
    status: map.status,
    error: map.error,
    width: map.width,
    height: map.height,
    entityId: map.entityId,
    entity: toEntityRef(row),
    featureCount: row.featureCount,
    createdAt: map.createdAt.toISOString(),
    updatedAt: map.updatedAt.toISOString(),
  };
}

async function getMapRow(db: DbOrTx, worldId: string, mapId: string): Promise<MapRow> {
  const [row] = await db
    .select()
    .from(maps)
    .where(and(eq(maps.id, mapId), eq(maps.worldId, worldId)));
  if (!row) throw notFound('Map');
  return row;
}

export async function listMaps(db: DbOrTx, worldId: string): Promise<AtlasMap[]> {
  const rows = await selectMaps(db)
    .where(eq(maps.worldId, worldId))
    .orderBy(sql`lower(${maps.name})`, asc(maps.createdAt));
  return rows.map(toMap);
}

export async function getMap(db: DbOrTx, worldId: string, mapId: string): Promise<AtlasMap> {
  const [row] = await selectMaps(db).where(and(eq(maps.id, mapId), eq(maps.worldId, worldId)));
  if (!row) throw notFound('Map');
  return toMap(row);
}

/** A map can't sit inside itself or its own descendants; `parentId` must be in this world. */
async function assertParent(db: DbOrTx, worldId: string, mapId: string | null, parentId: string) {
  const seen = new Set<string>();
  for (let current: string | null = parentId; current && !seen.has(current);) {
    if (current === mapId) throw badRequest("A map can't go inside itself or one of its own maps");
    seen.add(current);
    current = (await getMapRow(db, worldId, current)).parentId;
  }
}

export async function createMap(
  db: DbOrTx,
  worldId: string,
  input: z.output<typeof mapCreateSchema>,
  image: { path: string; width: number; height: number },
  log: TilingLog,
): Promise<AtlasMap> {
  if (input.parentId) await assertParent(db, worldId, null, input.parentId);
  if (input.entityId) await getEntityRow(db, worldId, input.entityId);

  const id = randomUUID();
  await mkdir(mapDir(worldId, id), { recursive: true });
  await rename(image.path, originalPath(worldId, id));
  try {
    await db.insert(maps).values({
      id,
      worldId,
      parentId: input.parentId,
      entityId: input.entityId,
      name: input.name,
      description: input.description,
      width: image.width,
      height: image.height,
    });
  } catch (error) {
    await removeMapFiles(worldId, id);
    throw error;
  }
  // Read the map before queueing, so the response always says "processing".
  const created = await getMap(db, worldId, id);
  enqueueTiling(id, log);
  return created;
}

export async function updateMap(
  db: DbOrTx,
  worldId: string,
  mapId: string,
  input: z.output<typeof mapUpdateSchema>,
): Promise<AtlasMap> {
  const existing = await getMapRow(db, worldId, mapId);
  if (input.parentId) await assertParent(db, worldId, existing.id, input.parentId);
  if (input.entityId) await getEntityRow(db, worldId, input.entityId);
  await db.update(maps).set(input).where(eq(maps.id, existing.id));
  return getMap(db, worldId, mapId);
}

/** Deletes a map, its features and its files. Maps inside it move up to the top level. */
export async function deleteMap(db: DbOrTx, worldId: string, mapId: string): Promise<void> {
  const existing = await getMapRow(db, worldId, mapId);
  await db.delete(maps).where(eq(maps.id, existing.id));
  await removeMapFiles(worldId, existing.id);
}

/** Tries the tiling again for a map where it failed. */
export async function retryTiling(
  db: DbOrTx,
  worldId: string,
  mapId: string,
  log: TilingLog,
): Promise<AtlasMap> {
  const existing = await getMapRow(db, worldId, mapId);
  if (existing.status !== 'failed') throw conflict('Only a map that failed can be retried');
  await db.update(maps).set({ status: 'processing', error: '' }).where(eq(maps.id, existing.id));
  const retried = await getMap(db, worldId, mapId);
  enqueueTiling(existing.id, log);
  return retried;
}

// ---- Tiles ----------------------------------------------------------------

async function readMapFile(path: string): Promise<Buffer> {
  try {
    return await readFile(path);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') throw notFound('Tile');
    throw error;
  }
}

export async function readTile(
  db: DbOrTx,
  worldId: string,
  mapId: string,
  z: number,
  x: number,
  y: number,
): Promise<Buffer> {
  const map = await getMapRow(db, worldId, mapId);
  if (map.status !== 'ready' || z > mapMaxZoom(map.width, map.height)) throw notFound('Tile');
  return readMapFile(tilePath(worldId, mapId, z, x, y));
}

export async function readThumbnail(db: DbOrTx, worldId: string, mapId: string): Promise<Buffer> {
  const map = await getMapRow(db, worldId, mapId);
  if (map.status !== 'ready') throw notFound('Thumbnail');
  return readMapFile(thumbnailPath(worldId, mapId));
}

// ---- Features -------------------------------------------------------------

function selectFeatures(db: DbOrTx) {
  return db
    .select({ feature: getTableColumns(mapFeatures), ...entityRefColumns })
    .from(mapFeatures)
    .leftJoin(entities, and(eq(entities.id, mapFeatures.entityId), isNull(entities.deletedAt)));
}

function toFeature(row: Awaited<ReturnType<typeof selectFeatures>>[number]): MapFeature {
  const { feature } = row;
  return {
    id: feature.id,
    mapId: feature.mapId,
    kind: feature.kind,
    points: feature.points,
    label: feature.label,
    notes: feature.notes,
    entityId: feature.entityId,
    entity: toEntityRef(row),
    linkMapId: feature.linkMapId,
    icon: feature.icon,
    color: feature.color,
    size: feature.size,
    lineStyle: feature.lineStyle,
    minZoom: feature.minZoom,
    updatedAt: feature.updatedAt.toISOString(),
  };
}

export async function listFeatures(
  db: DbOrTx,
  worldId: string,
  mapId: string,
): Promise<MapFeature[]> {
  await getMapRow(db, worldId, mapId);
  const rows = await selectFeatures(db)
    .where(and(eq(mapFeatures.mapId, mapId), eq(mapFeatures.worldId, worldId)))
    .orderBy(asc(mapFeatures.createdAt));
  return rows.map(toFeature);
}

async function getFeature(
  db: DbOrTx,
  worldId: string,
  mapId: string,
  featureId: string,
): Promise<MapFeature> {
  const [row] = await selectFeatures(db).where(
    and(
      eq(mapFeatures.id, featureId),
      eq(mapFeatures.mapId, mapId),
      eq(mapFeatures.worldId, worldId),
    ),
  );
  if (!row) throw notFound('Map item');
  return toFeature(row);
}

/** The entry and the map a feature points at must both exist in this world. */
async function assertFeatureLinks(
  db: DbOrTx,
  worldId: string,
  mapId: string,
  links: { entityId?: string | null; linkMapId?: string | null },
) {
  if (links.entityId) await getEntityRow(db, worldId, links.entityId);
  if (links.linkMapId) {
    if (links.linkMapId === mapId) throw badRequest("A map can't link to itself");
    await getMapRow(db, worldId, links.linkMapId);
  }
}

export async function createFeature(
  db: DbOrTx,
  worldId: string,
  mapId: string,
  input: z.output<typeof featureCreateSchema>,
): Promise<MapFeature> {
  await getMapRow(db, worldId, mapId);
  await assertFeatureLinks(db, worldId, mapId, input);
  const [row] = await db
    .insert(mapFeatures)
    .values({ ...input, worldId, mapId, points: roundPoints(input.points) })
    .returning({ id: mapFeatures.id });
  return getFeature(db, worldId, mapId, row!.id);
}

export async function updateFeature(
  db: DbOrTx,
  worldId: string,
  mapId: string,
  featureId: string,
  input: z.output<typeof featureUpdateSchema>,
): Promise<MapFeature> {
  const existing = await getFeature(db, worldId, mapId, featureId);
  if (input.points) {
    const problem = pointCountProblem(existing.kind, input.points);
    if (problem) throw badRequest(problem);
  }
  if (existing.kind === 'label' && input.label === '') {
    throw badRequest('A text label needs some text');
  }
  await assertFeatureLinks(db, worldId, mapId, input);
  await db
    .update(mapFeatures)
    .set({ ...input, ...(input.points ? { points: roundPoints(input.points) } : {}) })
    .where(eq(mapFeatures.id, existing.id));
  return getFeature(db, worldId, mapId, featureId);
}

export async function deleteFeature(
  db: DbOrTx,
  worldId: string,
  mapId: string,
  featureId: string,
): Promise<void> {
  const existing = await getFeature(db, worldId, mapId, featureId);
  await db.delete(mapFeatures).where(eq(mapFeatures.id, existing.id));
}

// ---- Entries, search, export ----------------------------------------------

/** The maps that show an entry, and the features on any map that point at it. */
export async function listEntityMapLinks(
  db: DbOrTx,
  worldId: string,
  entityId: string,
): Promise<EntityMapLink[]> {
  await getEntityRow(db, worldId, entityId);
  const [depicting, pinned] = await Promise.all([
    db
      .select({ mapId: maps.id, mapName: maps.name })
      .from(maps)
      .where(and(eq(maps.worldId, worldId), eq(maps.entityId, entityId)))
      .orderBy(asc(maps.name)),
    db
      .select({
        mapId: maps.id,
        mapName: maps.name,
        featureId: mapFeatures.id,
        kind: mapFeatures.kind,
      })
      .from(mapFeatures)
      .innerJoin(maps, eq(maps.id, mapFeatures.mapId))
      .where(and(eq(mapFeatures.worldId, worldId), eq(mapFeatures.entityId, entityId)))
      .orderBy(asc(maps.name), asc(mapFeatures.createdAt)),
  ]);
  return [
    ...depicting.map((m) => ({ ...m, featureId: null, kind: null })),
    ...pinned.map((p) => ({ ...p })),
  ];
}

const escapeLike = (text: string) => text.replace(/[\\%_]/g, (c) => `\\${c}`);

/** Maps by name and labelled map items by label. Items linked to entries are found through those. */
export async function searchAtlas(
  db: DbOrTx,
  worldId: string,
  q: string,
  limit: number,
): Promise<AtlasSearchResult[]> {
  const pattern = `%${escapeLike(q)}%`;
  const [mapRows, featureRows] = await Promise.all([
    db
      .select({ id: maps.id, name: maps.name })
      .from(maps)
      .where(and(eq(maps.worldId, worldId), ilike(maps.name, pattern)))
      .orderBy(sql`lower(${maps.name})`)
      .limit(limit),
    db
      .select({
        id: mapFeatures.id,
        mapId: maps.id,
        mapName: maps.name,
        kind: mapFeatures.kind,
        label: mapFeatures.label,
      })
      .from(mapFeatures)
      .innerJoin(maps, eq(maps.id, mapFeatures.mapId))
      .where(and(eq(mapFeatures.worldId, worldId), ilike(mapFeatures.label, pattern)))
      .orderBy(sql`lower(${mapFeatures.label})`)
      .limit(limit),
  ]);
  const results: AtlasSearchResult[] = [
    ...mapRows.map((m) => ({
      id: m.id,
      mapId: m.id,
      mapName: m.name,
      featureId: null,
      kind: 'map' as const,
      label: m.name,
    })),
    ...featureRows.map((f) => ({
      id: f.id,
      mapId: f.mapId,
      mapName: f.mapName,
      featureId: f.id,
      kind: f.kind,
      label: f.label,
    })),
  ];
  const lower = q.toLowerCase();
  const rank = (r: AtlasSearchResult) => (r.label.toLowerCase().startsWith(lower) ? 0 : 1);
  return results.sort((a, b) => rank(a) - rank(b)).slice(0, limit);
}

/** Every map and everything on it, for the world export. */
export async function exportAtlas(db: DbOrTx, worldId: string) {
  const [mapList, featureRows] = await Promise.all([
    listMaps(db, worldId),
    selectFeatures(db).where(eq(mapFeatures.worldId, worldId)).orderBy(asc(mapFeatures.createdAt)),
  ]);
  return { maps: mapList, features: featureRows.map(toFeature) };
}
