import { randomUUID } from 'node:crypto';
import { mkdir, readFile, rename, rm } from 'node:fs/promises';
import { join } from 'node:path';
import {
  and,
  asc,
  eq,
  getTableColumns,
  gte,
  inArray,
  ilike,
  isNotNull,
  isNull,
  lte,
  ne,
  or,
  sql,
  type SQL,
} from 'drizzle-orm';
import type { z } from 'zod';
import {
  BLANK_MAP_SHAPES,
  buildUniversalVtt,
  MAX_MAP_PIXELS,
  VTT_MAX_IMAGE_SIDE,
  FOG_COLOR,
  isUncovered,
  revealMaskSvg,
  TILE_SIZE,
  geojsonToItems,
  mapMaxZoom,
  pointCountProblem,
  reconcilePointDays,
  type Audience,
  type AtlasMap,
  type blankMapSchema,
  type geojsonImportSchema,
  type AtlasSearchResult,
  type EntityMapLink,
  type featureCreateSchema,
  type featureUpdateSchema,
  type MapEntityRef,
  type MapFeature,
  type MapLayer,
  type layerCreateSchema,
  type layerUpdateSchema,
  type mapCreateSchema,
  type MapPoint,
  type mapUpdateSchema,
} from '@atlas/shared';
import type { DbOrTx } from '../../db/client';
import { entities, mapFeatures, mapLayers, maps } from '../../db/schema';
import { badRequest, conflict, notFound } from '../../errors';
import sharp from '../../lib/sharp';
import { uploadsDir } from '../../lib/storage';
import { visibleTo } from '../../lib/visibility';
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

function selectMaps(db: DbOrTx, audience: Audience = 'gm') {
  return db
    .select({
      map: getTableColumns(maps),
      featureCount: sql<number>`(select count(*)::int from ${mapFeatures} where ${mapFeatures.mapId} = ${maps.id})`,
      ...entityRefColumns,
    })
    .from(maps)
    .leftJoin(
      entities,
      and(
        eq(entities.id, maps.entityId),
        isNull(entities.deletedAt),
        visibleTo(entities.visibility, audience),
      ),
    );
}

/**
 * `view` is given for audiences other than the GM: their own feature count, and whether the
 * parent map is one they can see (if not, this map reads as a top-level map to them).
 */
function toMap(
  row: Awaited<ReturnType<typeof selectMaps>>[number],
  view?: { featureCount: number; parentVisible: boolean },
): AtlasMap {
  const { map } = row;
  const entity = toEntityRef(row);
  return {
    id: map.id,
    parentId: view && !view.parentVisible ? null : map.parentId,
    name: map.name,
    description: map.description,
    status: map.status,
    error: map.error,
    width: map.width,
    height: map.height,
    imageVersion: map.imageVersion,
    scale: map.scale,
    fogEnabled: map.fogEnabled,
    entityId: view ? (entity?.id ?? null) : map.entityId,
    entity,
    visibility: map.visibility,
    featureCount: view ? view.featureCount : row.featureCount,
    createdAt: map.createdAt.toISOString(),
    updatedAt: map.updatedAt.toISOString(),
  };
}

async function getMapRow(
  db: DbOrTx,
  worldId: string,
  mapId: string,
  audience: Audience = 'gm',
): Promise<MapRow> {
  const [row] = await db
    .select()
    .from(maps)
    .where(
      and(eq(maps.id, mapId), eq(maps.worldId, worldId), visibleTo(maps.visibility, audience)),
    );
  if (!row) throw notFound('Map');
  return row;
}

/** The maps an audience can open. Other audiences get counts and parents for what they can see. */
export async function listMaps(
  db: DbOrTx,
  worldId: string,
  audience: Audience = 'gm',
): Promise<AtlasMap[]> {
  const rows = await selectMaps(db, audience)
    .where(and(eq(maps.worldId, worldId), visibleTo(maps.visibility, audience)))
    .orderBy(sql`lower(${maps.name})`, asc(maps.createdAt));
  if (audience === 'gm') return rows.map((row) => toMap(row));

  const visibleIds = new Set(rows.map((row) => row.map.id));
  const counts = new Map<string, number>();
  const [features, fog] = await Promise.all([
    selectFeatures(db, audience).where(
      and(eq(mapFeatures.worldId, worldId), featureVisible(audience)),
    ),
    loadFog(db, worldId, audience),
  ]);
  for (const { feature } of features) {
    if (hiddenByFog(fog, feature.mapId, feature.points)) continue;
    counts.set(feature.mapId, (counts.get(feature.mapId) ?? 0) + 1);
  }
  return rows.map((row) =>
    toMap(row, {
      featureCount: counts.get(row.map.id) ?? 0,
      parentVisible: row.map.parentId === null || visibleIds.has(row.map.parentId),
    }),
  );
}

export async function getMap(
  db: DbOrTx,
  worldId: string,
  mapId: string,
  audience: Audience = 'gm',
): Promise<AtlasMap> {
  if (audience !== 'gm') {
    const found = (await listMaps(db, worldId, audience)).find((map) => map.id === mapId);
    if (!found) throw notFound('Map');
    return found;
  }
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
      visibility: input.visibility,
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

/** Draws a plain canvas and makes a map of it, so places and roads can be laid out on nothing. */
export async function createBlankMap(
  db: DbOrTx,
  worldId: string,
  input: z.output<typeof blankMapSchema>,
  log: TilingLog,
): Promise<AtlasMap> {
  const { width, height } = BLANK_MAP_SHAPES[input.shape];
  const directory = uploadsDir();
  await mkdir(directory, { recursive: true });
  const path = join(directory, randomUUID());
  await sharp({ create: { width, height, channels: 3, background: input.background } })
    .png()
    .toFile(path);
  try {
    return await createMap(db, worldId, input, { path, width, height }, log);
  } finally {
    // After a successful create the file has moved, so this only cleans up failures.
    await rm(path, { force: true });
  }
}

/** Brings places, roads and areas from a GeoJSON document onto a map, hidden until revealed. */
export async function importGeoJson(
  db: DbOrTx,
  worldId: string,
  mapId: string,
  input: z.output<typeof geojsonImportSchema>,
): Promise<{ created: number; skipped: number }> {
  const map = await getMapRow(db, worldId, mapId);
  const { items, skipped } = geojsonToItems(
    input.geojson,
    { width: map.width, height: map.height },
    { flipY: input.flipY },
  );
  if (items.length === 0) {
    throw badRequest('We found no places, roads or areas in that file.');
  }
  await db.insert(mapFeatures).values(
    items.map((item) => ({
      worldId,
      mapId,
      kind: item.kind,
      points: item.points,
      label: item.label,
    })),
  );
  return { created: items.length, skipped };
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

/**
 * Swaps in a new image for a map. Pins, paths and regions stay where they are as fractions of
 * the map, so a new image of the same shape lines up, and one of a different shape stretches them.
 */
export async function replaceMapImage(
  db: DbOrTx,
  worldId: string,
  mapId: string,
  image: { path: string; width: number; height: number },
  log: TilingLog,
): Promise<AtlasMap> {
  const existing = await getMapRow(db, worldId, mapId);
  if (existing.status === 'processing') {
    throw conflict('This map is still being prepared. Try again once it has finished.');
  }
  await mkdir(mapDir(worldId, mapId), { recursive: true });
  await rename(image.path, originalPath(worldId, mapId));
  await db
    .update(maps)
    .set({
      width: image.width,
      height: image.height,
      imageVersion: sql`${maps.imageVersion} + 1`,
      status: 'processing',
      error: '',
    })
    .where(eq(maps.id, existing.id));
  const replaced = await getMap(db, worldId, mapId);
  enqueueTiling(existing.id, log);
  return replaced;
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
  audience: Audience = 'gm',
): Promise<{ data: Buffer; fogged: boolean }> {
  const map = await getMapRow(db, worldId, mapId, audience);
  if (map.status !== 'ready' || z > mapMaxZoom(map.width, map.height)) throw notFound('Tile');
  const tile = await readMapFile(tilePath(worldId, mapId, z, x, y));
  if (audience === 'gm' || !map.fogEnabled) return { data: tile, fogged: false };
  const areas = (await loadFog(db, worldId, audience)).get(mapId) ?? [];
  return { data: await fogTile(tile, areas, map, { z, x, y }), fogged: true };
}

/** Paints fog over everything in a tile that is not inside a revealed area. */
async function fogTile(
  tile: Buffer,
  areas: MapPoint[][],
  map: { width: number; height: number },
  at: { z: number; x: number; y: number },
): Promise<Buffer> {
  const mask = Buffer.from(revealMaskSvg(areas, map, at));
  const revealed = await sharp(tile)
    .ensureAlpha()
    .composite([{ input: mask, blend: 'dest-in' }])
    .png()
    .toBuffer();
  return sharp({
    create: { width: TILE_SIZE, height: TILE_SIZE, channels: 4, background: FOG_COLOR },
  })
    .composite([{ input: revealed }])
    .webp({ quality: 80 })
    .toBuffer();
}

/**
 * The map as a Universal VTT file for tabletop apps: the picture (scaled down if very large), a
 * grid, walls from a layer called Walls and lights from a layer called Lights. GM only.
 */
export async function exportUniversalVtt(
  db: DbOrTx,
  worldId: string,
  mapId: string,
  pixelsPerGrid: number,
): Promise<{ filename: string; json: string }> {
  const map = await getMapRow(db, worldId, mapId);
  if (map.status !== 'ready')
    throw conflict('This map is still being prepared. Try again shortly.');
  const [features, layers] = await Promise.all([
    db
      .select({ kind: mapFeatures.kind, points: mapFeatures.points, layerId: mapFeatures.layerId })
      .from(mapFeatures)
      .where(and(eq(mapFeatures.mapId, mapId), eq(mapFeatures.worldId, worldId))),
    db
      .select({ id: mapLayers.id, name: mapLayers.name })
      .from(mapLayers)
      .where(eq(mapLayers.mapId, mapId)),
  ]);
  const { data, info } = await sharp(originalPath(worldId, mapId), {
    limitInputPixels: MAX_MAP_PIXELS,
  })
    .rotate()
    .resize({
      width: VTT_MAX_IMAGE_SIDE,
      height: VTT_MAX_IMAGE_SIDE,
      fit: 'inside',
      withoutEnlargement: true,
    })
    .png()
    .toBuffer({ resolveWithObject: true });
  const vtt = buildUniversalVtt({
    imageWidth: info.width,
    imageHeight: info.height,
    pixelsPerGrid,
    features,
    layers,
    imageBase64: data.toString('base64'),
  });
  const name = map.name
    .replace(/[^\p{L}\p{N}]+/gu, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 60);
  return { filename: `${name || 'map'}.dd2vtt`, json: JSON.stringify(vtt) };
}

export async function readThumbnail(
  db: DbOrTx,
  worldId: string,
  mapId: string,
  audience: Audience = 'gm',
): Promise<Buffer> {
  const map = await getMapRow(db, worldId, mapId, audience);
  if (map.status !== 'ready') throw notFound('Thumbnail');
  // A fogged map's picture would show what is not yet uncovered, so players get plain fog.
  if (audience !== 'gm' && map.fogEnabled) {
    return sharp({ create: { width: 640, height: 400, channels: 3, background: FOG_COLOR } })
      .webp({ quality: 60 })
      .toBuffer();
  }
  return readMapFile(thumbnailPath(worldId, mapId));
}

// ---- Features -------------------------------------------------------------

function selectFeatures(db: DbOrTx, audience: Audience = 'gm') {
  return db
    .select({ feature: getTableColumns(mapFeatures), ...entityRefColumns })
    .from(mapFeatures)
    .leftJoin(
      entities,
      and(
        eq(entities.id, mapFeatures.entityId),
        isNull(entities.deletedAt),
        visibleTo(entities.visibility, audience),
      ),
    );
}

/**
 * Which features an audience sees: those shared with them, and, for one tied to an entry, only
 * if that entry is visible to them too (the join in `selectFeatures` finds nothing otherwise).
 */
function featureVisible(audience: Audience): SQL | undefined {
  if (audience === 'gm') return undefined;
  return and(
    visibleTo(mapFeatures.visibility, audience),
    // Revealed areas are the GM's tool; players only see what they uncover.
    ne(mapFeatures.kind, 'reveal'),
    or(isNull(mapFeatures.entityId), isNotNull(entities.id)),
  );
}

/** For each map with fog of war, the areas the GM has revealed. Empty for the GM. */
type Fog = Map<string, MapPoint[][]>;

async function loadFog(db: DbOrTx, worldId: string, audience: Audience): Promise<Fog> {
  if (audience === 'gm') return new Map();
  const fogged = await db
    .select({ id: maps.id })
    .from(maps)
    .where(and(eq(maps.worldId, worldId), eq(maps.fogEnabled, true)));
  if (fogged.length === 0) return new Map();
  const areas = await db
    .select({ mapId: mapFeatures.mapId, points: mapFeatures.points })
    .from(mapFeatures)
    .where(
      and(
        eq(mapFeatures.worldId, worldId),
        eq(mapFeatures.kind, 'reveal'),
        inArray(
          mapFeatures.mapId,
          fogged.map((m) => m.id),
        ),
      ),
    );
  const fog: Fog = new Map(fogged.map((m) => [m.id, []]));
  for (const area of areas) fog.get(area.mapId)!.push(area.points);
  return fog;
}

/** Is an item on a fogged map outside everything revealed? Then it must not be sent. */
const hiddenByFog = (fog: Fog, mapId: string, points: MapPoint[]) => {
  const areas = fog.get(mapId);
  return areas !== undefined && !isUncovered(points, areas);
};

/** The maps an audience can open, so links to any other map can be left out. */
async function visibleMapIds(db: DbOrTx, worldId: string, audience: Audience) {
  const rows = await db
    .select({ id: maps.id })
    .from(maps)
    .where(and(eq(maps.worldId, worldId), visibleTo(maps.visibility, audience)));
  return new Set(rows.map((row) => row.id));
}

/** `linkable`, for audiences other than the GM, is the set of maps they can open. */
function toFeature(
  row: Awaited<ReturnType<typeof selectFeatures>>[number],
  linkable?: Set<string>,
): MapFeature {
  const { feature } = row;
  const entity = toEntityRef(row);
  return {
    id: feature.id,
    mapId: feature.mapId,
    kind: feature.kind,
    points: feature.points,
    label: feature.label,
    notes: feature.notes,
    // Prep notes never leave the GM's own views (only the GM gets a feature without `linkable`).
    gmNotes: linkable ? '' : feature.gmNotes,
    layerId: feature.layerId,
    entityId: linkable ? (entity?.id ?? null) : feature.entityId,
    entity,
    linkMapId:
      linkable && feature.linkMapId && !linkable.has(feature.linkMapId) ? null : feature.linkMapId,
    icon: feature.icon,
    color: feature.color,
    size: feature.size,
    lineStyle: feature.lineStyle,
    minZoom: feature.minZoom,
    pointDays: feature.pointDays,
    validFromDay: feature.validFromDay,
    validToDay: feature.validToDay,
    visibility: feature.visibility,
    updatedAt: feature.updatedAt.toISOString(),
  };
}

/** Features that hold on `day`; ones with no dates always do. */
function holdsOn(day: number | undefined): SQL | undefined {
  if (day === undefined) return undefined;
  return and(
    or(isNull(mapFeatures.validFromDay), lte(mapFeatures.validFromDay, day)),
    or(isNull(mapFeatures.validToDay), gte(mapFeatures.validToDay, day)),
  );
}

/** `asOf` is an in-world day: only features that hold then are returned. */
export async function listFeatures(
  db: DbOrTx,
  worldId: string,
  mapId: string,
  audience: Audience = 'gm',
  asOf?: number,
): Promise<MapFeature[]> {
  await getMapRow(db, worldId, mapId, audience);
  const rows = await selectFeatures(db, audience)
    .where(
      and(
        eq(mapFeatures.mapId, mapId),
        eq(mapFeatures.worldId, worldId),
        featureVisible(audience),
        holdsOn(asOf),
      ),
    )
    .orderBy(asc(mapFeatures.createdAt));
  if (audience === 'gm') return rows.map((row) => toFeature(row));
  const [linkable, fog] = await Promise.all([
    visibleMapIds(db, worldId, audience),
    loadFog(db, worldId, audience),
  ]);
  return rows
    .filter((row) => !hiddenByFog(fog, mapId, row.feature.points))
    .map((row) => toFeature(row, linkable));
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
  links: { entityId?: string | null; linkMapId?: string | null; layerId?: string | null },
) {
  if (links.layerId) await getLayerRow(db, worldId, mapId, links.layerId);
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
    .values({
      ...input,
      worldId,
      mapId,
      points: roundPoints(input.points),
      pointDays: input.kind === 'journey' ? input.pointDays : null,
    })
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
  if (input.pointDays && existing.kind !== 'journey') {
    throw badRequest('Only a journey has dated stops');
  }
  const from = input.validFromDay === undefined ? existing.validFromDay : input.validFromDay;
  const to = input.validToDay === undefined ? existing.validToDay : input.validToDay;
  if (from !== null && to !== null && to < from) {
    throw badRequest('The end cannot come before the start');
  }
  const points = input.points ? roundPoints(input.points) : existing.points;
  // Stops keep their dates when a line is reshaped; asking for dates outright overrides that.
  let pointDays: (number | null)[] | null | undefined = input.pointDays;
  if (existing.kind === 'journey') {
    if (pointDays === undefined && input.points) {
      pointDays = reconcilePointDays(existing.points, existing.pointDays, points);
    }
    if (pointDays && pointDays.length !== points.length) {
      throw badRequest('Give one date (or none) for each stop');
    }
  }
  await db
    .update(mapFeatures)
    .set({
      ...input,
      ...(input.points ? { points } : {}),
      ...(pointDays !== undefined ? { pointDays } : {}),
    })
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

// ---- Layers ---------------------------------------------------------------

const MAX_LAYERS_PER_MAP = 20;

type LayerRow = typeof mapLayers.$inferSelect;

const toLayer = (row: LayerRow): MapLayer => ({
  id: row.id,
  mapId: row.mapId,
  name: row.name,
  visibleByDefault: row.visibleByDefault,
  sortOrder: row.sortOrder,
});

async function getLayerRow(
  db: DbOrTx,
  worldId: string,
  mapId: string,
  layerId: string,
): Promise<LayerRow> {
  const [row] = await db
    .select()
    .from(mapLayers)
    .where(
      and(eq(mapLayers.id, layerId), eq(mapLayers.mapId, mapId), eq(mapLayers.worldId, worldId)),
    );
  if (!row) throw notFound('Layer');
  return row;
}

/**
 * A map's layers in order. Other audiences only get layers that hold something they can see,
 * so the name of a secret layer does not leak.
 */
export async function listLayers(
  db: DbOrTx,
  worldId: string,
  mapId: string,
  audience: Audience = 'gm',
): Promise<MapLayer[]> {
  await getMapRow(db, worldId, mapId, audience);
  const rows = await db
    .select()
    .from(mapLayers)
    .where(and(eq(mapLayers.mapId, mapId), eq(mapLayers.worldId, worldId)))
    .orderBy(asc(mapLayers.sortOrder), asc(mapLayers.createdAt));
  if (audience === 'gm') return rows.map(toLayer);
  const used = new Set(
    (await listFeatures(db, worldId, mapId, audience)).map((feature) => feature.layerId),
  );
  return rows.filter((row) => used.has(row.id)).map(toLayer);
}

export async function createLayer(
  db: DbOrTx,
  worldId: string,
  mapId: string,
  input: z.output<typeof layerCreateSchema>,
): Promise<MapLayer> {
  await getMapRow(db, worldId, mapId);
  const existing = await db
    .select({ sortOrder: mapLayers.sortOrder })
    .from(mapLayers)
    .where(eq(mapLayers.mapId, mapId));
  if (existing.length >= MAX_LAYERS_PER_MAP) {
    throw badRequest(`A map can have up to ${MAX_LAYERS_PER_MAP} layers`);
  }
  const sortOrder = existing.reduce((top, row) => Math.max(top, row.sortOrder), -1) + 1;
  const [row] = await db
    .insert(mapLayers)
    .values({ ...input, worldId, mapId, sortOrder })
    .returning();
  return toLayer(row!);
}

export async function updateLayer(
  db: DbOrTx,
  worldId: string,
  mapId: string,
  layerId: string,
  input: z.output<typeof layerUpdateSchema>,
): Promise<MapLayer> {
  const existing = await getLayerRow(db, worldId, mapId, layerId);
  if (Object.keys(input).length === 0) return toLayer(existing);
  const [row] = await db
    .update(mapLayers)
    .set(input)
    .where(eq(mapLayers.id, existing.id))
    .returning();
  return toLayer(row!);
}

/** Removes a layer; what was on it goes back to the base map. */
export async function deleteLayer(
  db: DbOrTx,
  worldId: string,
  mapId: string,
  layerId: string,
): Promise<void> {
  const existing = await getLayerRow(db, worldId, mapId, layerId);
  await db.delete(mapLayers).where(eq(mapLayers.id, existing.id));
}

// ---- Entries, search, export ----------------------------------------------

/** The maps that show an entry, and the features on any map that point at it. */
export async function listEntityMapLinks(
  db: DbOrTx,
  worldId: string,
  entityId: string,
  audience: Audience = 'gm',
): Promise<EntityMapLink[]> {
  await getEntityRow(db, worldId, entityId, audience);
  const [depicting, pinned] = await Promise.all([
    db
      .select({ mapId: maps.id, mapName: maps.name })
      .from(maps)
      .where(
        and(
          eq(maps.worldId, worldId),
          eq(maps.entityId, entityId),
          visibleTo(maps.visibility, audience),
        ),
      )
      .orderBy(asc(maps.name)),
    db
      .select({
        mapId: maps.id,
        mapName: maps.name,
        featureId: mapFeatures.id,
        kind: mapFeatures.kind,
        points: mapFeatures.points,
      })
      .from(mapFeatures)
      .innerJoin(maps, eq(maps.id, mapFeatures.mapId))
      .where(
        and(
          eq(mapFeatures.worldId, worldId),
          eq(mapFeatures.entityId, entityId),
          visibleTo(mapFeatures.visibility, audience),
          visibleTo(maps.visibility, audience),
        ),
      )
      .orderBy(asc(maps.name), asc(mapFeatures.createdAt)),
  ]);
  const fog = await loadFog(db, worldId, audience);
  return [
    ...depicting.map((m) => ({ ...m, featureId: null, kind: null })),
    ...pinned
      .filter((p) => p.kind !== 'reveal' || audience === 'gm')
      .filter((p) => !hiddenByFog(fog, p.mapId, p.points))
      .map(({ points: _points, ...link }) => link),
  ];
}

const escapeLike = (text: string) => text.replace(/[\\%_]/g, (c) => `\\${c}`);

/** Maps by name and labelled map items by label. Items linked to entries are found through those. */
export async function searchAtlas(
  db: DbOrTx,
  worldId: string,
  q: string,
  limit: number,
  audience: Audience = 'gm',
): Promise<AtlasSearchResult[]> {
  const pattern = `%${escapeLike(q)}%`;
  const fog = await loadFog(db, worldId, audience);
  const [mapRows, featureRows] = await Promise.all([
    db
      .select({ id: maps.id, name: maps.name })
      .from(maps)
      .where(
        and(
          eq(maps.worldId, worldId),
          ilike(maps.name, pattern),
          visibleTo(maps.visibility, audience),
        ),
      )
      .orderBy(sql`lower(${maps.name})`)
      .limit(limit),
    db
      .select({
        id: mapFeatures.id,
        mapId: maps.id,
        mapName: maps.name,
        kind: mapFeatures.kind,
        label: mapFeatures.label,
        points: mapFeatures.points,
      })
      .from(mapFeatures)
      .innerJoin(maps, eq(maps.id, mapFeatures.mapId))
      .leftJoin(
        entities,
        and(
          eq(entities.id, mapFeatures.entityId),
          isNull(entities.deletedAt),
          visibleTo(entities.visibility, audience),
        ),
      )
      .where(
        and(
          eq(mapFeatures.worldId, worldId),
          ilike(mapFeatures.label, pattern),
          visibleTo(maps.visibility, audience),
          featureVisible(audience),
        ),
      )
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
    ...featureRows
      .filter((f) => !hiddenByFog(fog, f.mapId, f.points))
      .map((f) => ({
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
  const [mapList, featureRows, layerRows] = await Promise.all([
    listMaps(db, worldId),
    selectFeatures(db).where(eq(mapFeatures.worldId, worldId)).orderBy(asc(mapFeatures.createdAt)),
    db
      .select()
      .from(mapLayers)
      .where(eq(mapLayers.worldId, worldId))
      .orderBy(asc(mapLayers.sortOrder), asc(mapLayers.createdAt)),
  ]);
  return {
    maps: mapList,
    features: featureRows.map((row) => toFeature(row)),
    layers: layerRows.map(toLayer),
  };
}
