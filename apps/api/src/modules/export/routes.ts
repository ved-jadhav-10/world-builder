import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { db } from '../../db/client';
import { currentWorldId, requireRole } from '../../plugins/auth-guard';
import { buildMarkdownZip } from './markdown';
import { exportWorld } from './service';

export const exportRoutes: FastifyPluginAsyncZod = async (app) => {
  // Exports include GM-only content, so they need edit rights.
  app.get('/export', { onRequest: requireRole('editor') }, async (request, reply) => {
    const data = await exportWorld(db, currentWorldId(request));
    const date = data.exportedAt.slice(0, 10);
    return reply
      .header('content-disposition', `attachment; filename="${data.world.slug}-${date}.json"`)
      .send(data);
  });

  // The same world as Markdown notes (for Obsidian and other note apps), with pictures and JSON.
  app.get('/export/markdown', { onRequest: requireRole('editor') }, async (request, reply) => {
    const { filename, data } = await buildMarkdownZip(db, currentWorldId(request));
    return reply
      .header('content-type', 'application/zip')
      .header('content-disposition', `attachment; filename="${filename}"`)
      .send(Buffer.from(data));
  });
};
