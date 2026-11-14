import { z } from 'zod';
import { fieldSchemaFor, fieldValuesFor } from './fields';
import { canSee, PREVIEW_AUDIENCES, type Audience } from './audience';
import { stripSecretBlocks } from './secret-blocks';
import type { WorldExport } from './types';

/** `?audience=` on the JSON and Markdown exports; left out means the GM's own full copy. */
export const audienceExportQuerySchema = z.object({
  audience: z.enum(PREVIEW_AUDIENCES).optional(),
});

/**
 * A copy of a world export holding only what an audience can see, so a GM can hand a player or a
 * beta reader their own version. The GM's export comes back unchanged.
 *
 * What goes: entries, maps, pictures, tables, handouts and progressions the audience may not
 * see; secret blocks inside the notes the audience may, and fields marked GM-only (their values
 * and their names); links to entries they may not see; the
 * map details of a fogged map (a player is only ever shown what the GM uncovered); GM notes on
 * map features. The manuscript, plot boards, to-dos, templates, comments and faction scores are
 * the author's own workspace and are always left out.
 */
export function redactWorldExport(data: WorldExport, audience: Audience): WorldExport {
  if (audience === 'gm') return data;

  const schemaByType = new Map(data.entityTypes.map((type) => [type.id, type.fieldSchema]));
  const entities = data.entities
    .filter((entity) => canSee(audience, entity.visibility))
    .map((entity) => ({
      ...entity,
      body: stripSecretBlocks(entity.body),
      fields: fieldValuesFor(schemaByType.get(entity.typeId) ?? [], entity.fields, audience),
      // The spoiler gate names a chapter of the manuscript, which is not in this copy.
      revealNodeId: null,
    }));
  const entityIds = new Set(entities.map((entity) => entity.id));
  const usedTagIds = new Set(entities.flatMap((entity) => entity.tagIds));

  const maps = data.atlas.maps
    .filter((map) => canSee(audience, map.visibility))
    .map((map) =>
      map.entityId && !entityIds.has(map.entityId) ? { ...map, entityId: null, entity: null } : map,
    );
  // A fogged map keeps its name and picture details but none of what is drawn on it.
  const openMapIds = new Set(maps.filter((map) => !map.fogEnabled).map((map) => map.id));
  const features = data.atlas.features
    .filter((feature) => openMapIds.has(feature.mapId) && canSee(audience, feature.visibility))
    .map((feature) => {
      const entityHidden = feature.entityId !== null && !entityIds.has(feature.entityId);
      return {
        ...feature,
        gmNotes: '',
        ...(entityHidden ? { entityId: null, entity: null } : {}),
      };
    });

  return {
    ...data,
    entityTypes: data.entityTypes.map((type) => ({
      ...type,
      fieldSchema: fieldSchemaFor(type.fieldSchema, audience),
    })),
    tags: data.tags.filter((tag) => usedTagIds.has(tag.id)),
    entities,
    relationships: data.relationships.filter(
      (link) => entityIds.has(link.sourceId) && entityIds.has(link.targetId),
    ),
    manuscript: [],
    atlas: {
      maps,
      features,
      layers: data.atlas.layers.filter((layer) => openMapIds.has(layer.mapId)),
    },
    progressions: data.progressions
      .filter((item) => entityIds.has(item.entityId) && canSee(audience, item.visibility))
      .map((item) => {
        const fields = item.changes.fields;
        const entityTypeId = entities.find((e) => e.id === item.entityId)?.typeId;
        if (!fields || !entityTypeId) return item;
        const kept = fieldValuesFor(schemaByType.get(entityTypeId) ?? [], fields, audience);
        return { ...item, changes: { ...item.changes, fields: kept } };
      }),
    gallery: data.gallery.filter(
      (image) =>
        canSee(audience, image.visibility) &&
        (image.entityId === null || entityIds.has(image.entityId)),
    ),
    rollTables: data.rollTables.filter((table) => canSee(audience, table.visibility)),
    plotBoards: [],
    handouts: data.handouts.filter((handout) => canSee(audience, handout.visibility)),
    todos: [],
    entryTemplates: [],
    comments: [],
    diplomacy: [],
  };
}
