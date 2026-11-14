import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { and, eq, isNull, sql } from 'drizzle-orm';
import {
  entityCreateSchema,
  markdownImportSchema,
  markdownLinksSchema,
  matchTypeKey,
  parseMarkdownNote,
  type MarkdownImportResult,
} from '@atlas/shared';
import { db } from '../../db/client';
import { entities, relationships, relationshipTypes } from '../../db/schema';
import { limits } from '../../lib/rate-limits';
import { currentUser, currentWorldId, requireRole } from '../../plugins/auth-guard';
import { createEntity } from '../entities/service';
import { listEntityTypes } from '../entity-types/service';
import { createRelationshipType } from '../relationships/service';
import { attachTag, createTag, listTags } from '../tags/service';

/** The link type that wikilinks between imported notes become; made the first time it is needed. */
const MENTION = { label: 'mentions', inverseLabel: 'mentioned in' };

/**
 * Bringing notes in from elsewhere. Notes arrive as text (the browser reads the files), so there
 * is nothing to unpack here. Entries are made first; links are a second call, once every note of
 * a large vault exists and names can be matched.
 */
export const importRoutes: FastifyPluginAsyncZod = async (app) => {
  app.post(
    '/import/markdown',
    {
      onRequest: requireRole('editor'),
      config: limits.export,
      schema: { body: markdownImportSchema },
    },
    async (request): Promise<MarkdownImportResult> => {
      const worldId = currentWorldId(request);
      const userId = currentUser(request).id;
      const types = await listEntityTypes(db, worldId);
      const typeByKey = new Map(types.map((type) => [type.key, type]));
      const taken = new Set(
        (
          await db
            .select({ name: sql<string>`lower(${entities.name})` })
            .from(entities)
            .where(and(eq(entities.worldId, worldId), isNull(entities.deletedAt)))
        ).map((row) => row.name),
      );
      const tagIds = new Map(
        (await listTags(db, worldId)).map((tag) => [tag.name.toLowerCase(), tag.id]),
      );

      const result: MarkdownImportResult = { created: 0, skipped: [], byType: {} };
      for (const file of request.body.notes) {
        const note = parseMarkdownNote(file.path, file.content);
        const name = note.name.trim();
        if (!name) continue;
        // Importing the same vault twice must not double everything.
        if (taken.has(name.toLowerCase())) {
          result.skipped.push(name);
          continue;
        }
        const type = typeByKey.get(
          matchTypeKey(note.typeHint, types, request.body.defaultTypeKey),
        )!;
        const entity = await createEntity(
          db,
          worldId,
          userId,
          entityCreateSchema.parse({
            typeId: type.id,
            name,
            aliases: note.aliases,
            summary: note.summary,
            body: note.body,
          }),
        );
        taken.add(name.toLowerCase());
        for (const tagName of note.tags) {
          let tagId = tagIds.get(tagName.toLowerCase());
          if (!tagId) {
            tagId = (await createTag(db, worldId, { name: tagName, color: '#64748b' })).id;
            tagIds.set(tagName.toLowerCase(), tagId);
          }
          await attachTag(db, worldId, entity.id, tagId);
        }
        result.created++;
        result.byType[type.name] = (result.byType[type.name] ?? 0) + 1;
      }
      return result;
    },
  );

  app.post(
    '/import/markdown/links',
    { onRequest: requireRole('editor'), schema: { body: markdownLinksSchema } },
    async (request): Promise<{ linked: number }> => {
      const worldId = currentWorldId(request);
      const byName = new Map(
        (
          await db
            .select({ id: entities.id, name: sql<string>`lower(${entities.name})` })
            .from(entities)
            .where(and(eq(entities.worldId, worldId), isNull(entities.deletedAt)))
        ).map((row) => [row.name, row.id]),
      );
      const pairs = new Map<string, { sourceId: string; targetId: string }>();
      for (const link of request.body.links) {
        const sourceId = byName.get(link.from.trim().toLowerCase());
        const targetId = byName.get(link.to.trim().toLowerCase());
        if (sourceId && targetId && sourceId !== targetId) {
          pairs.set(`${sourceId}:${targetId}`, { sourceId, targetId });
        }
      }
      if (pairs.size === 0) return { linked: 0 };

      let [type] = await db
        .select({ id: relationshipTypes.id })
        .from(relationshipTypes)
        .where(
          and(eq(relationshipTypes.worldId, worldId), eq(relationshipTypes.label, MENTION.label)),
        );
      type ??= await createRelationshipType(db, worldId, MENTION);
      // A second import of the same vault adds only the links that are new.
      const existing = new Set(
        (
          await db
            .select({ sourceId: relationships.sourceId, targetId: relationships.targetId })
            .from(relationships)
            .where(
              and(
                eq(relationships.worldId, worldId),
                eq(relationships.typeId, type.id),
                isNull(relationships.deletedAt),
              ),
            )
        ).map((row) => `${row.sourceId}:${row.targetId}`),
      );
      const fresh = [...pairs].filter(([key]) => !existing.has(key)).map(([, pair]) => pair);
      if (fresh.length) {
        await db
          .insert(relationships)
          .values(fresh.map((pair) => ({ ...pair, worldId, typeId: type.id, notes: '' })));
      }
      return { linked: fresh.length };
    },
  );
};
