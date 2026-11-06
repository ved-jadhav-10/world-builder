import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import {
  epubExportQuerySchema,
  manuscriptExportQuerySchema,
  scriptExportQuerySchema,
} from '@atlas/shared';
import { db } from '../../db/client';
import { limits } from '../../lib/rate-limits';
import { currentUser, currentWorldId, requireRole } from '../../plugins/auth-guard';
import { buildManuscriptDocx } from './docx';
import { buildManuscriptEpub } from './epub';
import { buildMarkdownZip } from './markdown';
import { buildManuscriptPdf, buildStoryBiblePdf } from './pdf';
import { buildScriptExport } from './script';
import { exportWorld } from './service';

export const exportRoutes: FastifyPluginAsyncZod = async (app) => {
  // Exports include GM-only content, so they need edit rights.
  app.get(
    '/export',
    { onRequest: requireRole('editor'), config: limits.export },
    async (request, reply) => {
      const data = await exportWorld(db, currentWorldId(request));
      const date = data.exportedAt.slice(0, 10);
      return reply
        .header('content-disposition', `attachment; filename="${data.world.slug}-${date}.json"`)
        .send(data);
    },
  );

  // The same world as Markdown notes (for Obsidian and other note apps), with pictures and JSON.
  app.get(
    '/export/markdown',
    { onRequest: requireRole('editor'), config: limits.export },
    async (request, reply) => {
      const { filename, data } = await buildMarkdownZip(db, currentWorldId(request));
      return reply
        .header('content-type', 'application/zip')
        .header('content-disposition', `attachment; filename="${filename}"`)
        .send(Buffer.from(data));
    },
  );
  // The manuscript as a Word document. It holds every scene, GM-only ones included.
  app.get(
    '/export/manuscript.docx',
    {
      onRequest: requireRole('editor'),
      config: limits.export,
      schema: { querystring: manuscriptExportQuerySchema },
    },
    async (request, reply) => {
      const { filename, data } = await buildManuscriptDocx(db, currentWorldId(request), {
        ...request.query,
        author: request.query.author ?? currentUser(request).name,
      });
      return reply
        .header(
          'content-type',
          'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        )
        .header(
          'content-disposition',
          `attachment; filename="manuscript.docx"; filename*=UTF-8''${encodeURIComponent(filename)}`,
        )
        .send(data);
    },
  );

  // The manuscript as an EPUB, for e-readers. Like the Word export it holds every scene.
  app.get(
    '/export/manuscript.epub',
    {
      onRequest: requireRole('editor'),
      config: limits.export,
      schema: { querystring: epubExportQuerySchema },
    },
    async (request, reply) => {
      const { filename, data } = await buildManuscriptEpub(db, currentWorldId(request), {
        bookId: request.query.bookId,
        author: request.query.author ?? currentUser(request).name,
      });
      return reply
        .header('content-type', 'application/epub+zip')
        .header(
          'content-disposition',
          'attachment; filename="manuscript.epub"; filename*=UTF-8\'\'' +
            encodeURIComponent(filename),
        )
        .send(Buffer.from(data));
    },
  );

  // The manuscript as a PDF, in the same two layouts as the Word export.
  app.get(
    '/export/manuscript.pdf',
    {
      onRequest: requireRole('editor'),
      config: limits.export,
      schema: { querystring: manuscriptExportQuerySchema },
    },
    async (request, reply) => {
      const { filename, data } = await buildManuscriptPdf(db, currentWorldId(request), {
        ...request.query,
        author: request.query.author ?? currentUser(request).name,
      });
      return reply
        .header('content-type', 'application/pdf')
        .header(
          'content-disposition',
          'attachment; filename="manuscript.pdf"; filename*=UTF-8\'\'' +
            encodeURIComponent(filename),
        )
        .send(data);
    },
  );

  // The manuscript as a screenplay (Fountain) or a comic script: structure to adapt, not a rewrite.
  app.get(
    '/export/manuscript-script',
    {
      onRequest: requireRole('editor'),
      config: limits.export,
      schema: { querystring: scriptExportQuerySchema },
    },
    async (request, reply) => {
      const { filename, data, contentType } = await buildScriptExport(db, currentWorldId(request), {
        kind: request.query.kind,
        bookId: request.query.bookId,
        author: request.query.author ?? currentUser(request).name,
      });
      return reply
        .header('content-type', `${contentType}; charset=utf-8`)
        .header(
          'content-disposition',
          `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`,
        )
        .send(data);
    },
  );

  // Every entry, the timeline and the manuscript outline as a printable reference. It holds
  // GM-only material, so it needs edit rights.
  app.get(
    '/export/story-bible.pdf',
    { onRequest: requireRole('editor'), config: limits.export },
    async (request, reply) => {
      const { filename, data } = await buildStoryBiblePdf(db, currentWorldId(request));
      return reply
        .header('content-type', 'application/pdf')
        .header(
          'content-disposition',
          'attachment; filename="story-bible.pdf"; filename*=UTF-8\'\'' +
            encodeURIComponent(filename),
        )
        .send(data);
    },
  );
};
