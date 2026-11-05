import { createHash } from 'node:crypto';
import { and, desc, eq, inArray, sql, type SQL } from 'drizzle-orm';
import { ZodError, type z } from 'zod';
import {
  countWords,
  MAX_AUTO_REVISIONS,
  MAX_NAMED_REVISIONS,
  MAX_RESTORE_COPIES,
  REVISION_WINDOW_MINUTES,
  richTextBlocks,
  type Entity,
  type entityUpdateSchema,
  type EntityRevisionContent,
  type RevisionDetail,
  type RevisionKind,
  type RevisionSummary,
  type RichTextDoc,
  type SceneRevisionContent,
} from '@atlas/shared';
import type { DbOrTx } from '../../db/client';
import { entities, manuscriptNodes, revisions } from '../../db/schema';
import { user } from '../../db/auth-schema';
import { badRequest, notFound } from '../../errors';
import { updateEntity } from '../entities/service';
import { saveSceneBody, updateNode } from '../manuscript/service';

/** What has a history: an entry, or a scene of the manuscript. */
export interface Subject {
  kind: 'entity' | 'scene';
  id: string;
}

interface Snapshot {
  content: Record<string, unknown>;
  title: string;
  words: number;
}

const subjectWhere = (worldId: string, subject: Subject): SQL | undefined =>
  and(
    eq(revisions.worldId, worldId),
    subject.kind === 'entity'
      ? eq(revisions.entityId, subject.id)
      : eq(revisions.nodeId, subject.id),
  );

const hashOf = (content: unknown) =>
  createHash('sha256').update(JSON.stringify(content)).digest('hex').slice(0, 32);

/** The history belongs to a live thing; a missing entry or scene is a 404. */
async function snapshot(db: DbOrTx, worldId: string, subject: Subject): Promise<Snapshot> {
  if (subject.kind === 'entity') {
    const [row] = await db
      .select()
      .from(entities)
      .where(and(eq(entities.id, subject.id), eq(entities.worldId, worldId)));
    if (!row) throw notFound('Entry');
    const content: EntityRevisionContent = {
      name: row.name,
      aliases: row.aliases,
      summary: row.summary,
      fields: row.fields,
      body: row.body ?? null,
      startDay: row.startDay,
      endDay: row.endDay,
    };
    return {
      content: content as unknown as Record<string, unknown>,
      title: row.name,
      words: countWords(`${row.summary}\n${richTextBlocks(row.body).join('\n')}`),
    };
  }
  const [row] = await db
    .select()
    .from(manuscriptNodes)
    .where(
      and(
        eq(manuscriptNodes.id, subject.id),
        eq(manuscriptNodes.worldId, worldId),
        eq(manuscriptNodes.kind, 'scene'),
      ),
    );
  if (!row) throw notFound('Scene');
  const content: SceneRevisionContent = {
    title: row.title,
    summary: row.summary,
    body: row.body ?? null,
  };
  return {
    content: content as unknown as Record<string, unknown>,
    title: row.title,
    words: row.wordCount,
  };
}

async function latestRevision(db: DbOrTx, worldId: string, subject: Subject) {
  const [row] = await db
    .select({
      id: revisions.id,
      kind: revisions.kind,
      contentHash: revisions.contentHash,
      createdBy: revisions.createdBy,
      // Compared in the database, so the app server's clock does not matter.
      fresh: sql<boolean>`${revisions.createdAt} > now() - make_interval(mins => ${REVISION_WINDOW_MINUTES})`,
    })
    .from(revisions)
    .where(subjectWhere(worldId, subject))
    .orderBy(desc(revisions.createdAt), desc(revisions.id))
    .limit(1);
  return row;
}

async function insertRevision(
  db: DbOrTx,
  worldId: string,
  subject: Subject,
  kind: RevisionKind,
  label: string,
  snap: Snapshot,
  userId: string | null,
) {
  await db.insert(revisions).values({
    worldId,
    entityId: subject.kind === 'entity' ? subject.id : null,
    nodeId: subject.kind === 'scene' ? subject.id : null,
    kind,
    label,
    content: snap.content,
    contentHash: hashOf(snap.content),
    title: snap.title,
    words: snap.words,
    createdBy: userId,
  });
}

/** Deletes the oldest versions of a kind past its cap. */
async function prune(
  db: DbOrTx,
  worldId: string,
  subject: Subject,
  kind: RevisionKind,
  keep: number,
) {
  const extra = await db
    .select({ id: revisions.id })
    .from(revisions)
    .where(and(subjectWhere(worldId, subject), eq(revisions.kind, kind)))
    .orderBy(desc(revisions.createdAt), desc(revisions.id))
    .offset(keep);
  if (extra.length > 0) {
    await db.delete(revisions).where(
      inArray(
        revisions.id,
        extra.map((r) => r.id),
      ),
    );
  }
}

/**
 * Call before the first edit of something. If it has no history yet, what it says now is kept
 * as the earliest version, so the very first edit can be undone too.
 */
export async function beforeEdit(db: DbOrTx, worldId: string, subject: Subject): Promise<void> {
  if (await latestRevision(db, worldId, subject)) return;
  await insertRevision(
    db,
    worldId,
    subject,
    'auto',
    '',
    await snapshot(db, worldId, subject),
    null,
  );
}

/**
 * Call after each edit. Writing makes many saves in a row, so saves by the same person within
 * ten minutes of a version's start are folded into it rather than each becoming a version.
 */
export async function afterEdit(
  db: DbOrTx,
  worldId: string,
  subject: Subject,
  userId: string,
): Promise<void> {
  const snap = await snapshot(db, worldId, subject);
  const hash = hashOf(snap.content);
  const latest = await latestRevision(db, worldId, subject);
  if (latest?.contentHash === hash) return;
  if (latest && latest.kind === 'auto' && latest.createdBy === userId && latest.fresh) {
    await db
      .update(revisions)
      .set({ content: snap.content, contentHash: hash, title: snap.title, words: snap.words })
      .where(eq(revisions.id, latest.id));
    return;
  }
  await insertRevision(db, worldId, subject, 'auto', '', snap, userId);
  await prune(db, worldId, subject, 'auto', MAX_AUTO_REVISIONS);
}

// ---- Reading ---------------------------------------------------------------

const summaryColumns = {
  id: revisions.id,
  kind: revisions.kind,
  label: revisions.label,
  createdAt: revisions.createdAt,
  title: revisions.title,
  words: revisions.words,
  author: user.name,
};

function toSummary(row: {
  id: string;
  kind: RevisionKind;
  label: string;
  createdAt: Date;
  title: string;
  words: number;
  author: string | null;
}): RevisionSummary {
  return {
    id: row.id,
    kind: row.kind,
    label: row.label,
    createdAt: row.createdAt.toISOString(),
    author: row.author,
    title: row.title,
    words: row.words,
  };
}

export async function listRevisions(
  db: DbOrTx,
  worldId: string,
  subject: Subject,
): Promise<RevisionSummary[]> {
  // Say 404 for a missing entry or scene rather than an empty history.
  await snapshot(db, worldId, subject);
  const rows = await db
    .select(summaryColumns)
    .from(revisions)
    .leftJoin(user, eq(user.id, revisions.createdBy))
    .where(subjectWhere(worldId, subject))
    .orderBy(desc(revisions.createdAt), desc(revisions.id))
    .limit(200);
  return rows.map(toSummary);
}

async function getRevisionRow(db: DbOrTx, worldId: string, subject: Subject, revisionId: string) {
  const [row] = await db
    .select({ ...summaryColumns, content: revisions.content })
    .from(revisions)
    .leftJoin(user, eq(user.id, revisions.createdBy))
    .where(and(subjectWhere(worldId, subject), eq(revisions.id, revisionId)));
  if (!row) throw notFound('Version');
  return row;
}

export async function getRevision<Content>(
  db: DbOrTx,
  worldId: string,
  subject: Subject,
  revisionId: string,
): Promise<RevisionDetail<Content>> {
  const row = await getRevisionRow(db, worldId, subject, revisionId);
  return { ...toSummary(row), content: row.content as Content };
}

// ---- Writing ---------------------------------------------------------------

/** Keeps the present text as a version the author names. */
export async function createNamedRevision(
  db: DbOrTx,
  worldId: string,
  subject: Subject,
  userId: string,
  label: string,
): Promise<RevisionSummary> {
  const snap = await snapshot(db, worldId, subject);
  const [counted] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(revisions)
    .where(and(subjectWhere(worldId, subject), eq(revisions.kind, 'manual')));
  if ((counted?.count ?? 0) >= MAX_NAMED_REVISIONS) {
    throw badRequest(`You can keep up to ${MAX_NAMED_REVISIONS} named versions. Delete one first.`);
  }
  await insertRevision(db, worldId, subject, 'manual', label, snap, userId);
  const [row] = await db
    .select(summaryColumns)
    .from(revisions)
    .leftJoin(user, eq(user.id, revisions.createdBy))
    .where(and(subjectWhere(worldId, subject), eq(revisions.kind, 'manual')))
    .orderBy(desc(revisions.createdAt), desc(revisions.id))
    .limit(1);
  return toSummary(row!);
}

export async function deleteRevision(
  db: DbOrTx,
  worldId: string,
  subject: Subject,
  revisionId: string,
): Promise<void> {
  const row = await getRevisionRow(db, worldId, subject, revisionId);
  await db.delete(revisions).where(eq(revisions.id, row.id));
}

/** Keeps what is there now, unless it already is the newest version, before it is overwritten. */
async function keepCurrent(db: DbOrTx, worldId: string, subject: Subject, userId: string) {
  const snap = await snapshot(db, worldId, subject);
  const latest = await latestRevision(db, worldId, subject);
  if (latest?.contentHash === hashOf(snap.content)) return;
  await insertRevision(
    db,
    worldId,
    subject,
    'restore',
    'Before restoring an older version',
    snap,
    userId,
  );
}

/**
 * Records what a restore produced. It is its own kind of version, so the next edit starts a
 * version of its own rather than being folded into (and overwriting) the one before.
 */
async function keepRestored(db: DbOrTx, worldId: string, subject: Subject, userId: string) {
  await insertRevision(
    db,
    worldId,
    subject,
    'restore',
    'Restored an older version',
    await snapshot(db, worldId, subject),
    userId,
  );
  await prune(db, worldId, subject, 'restore', MAX_RESTORE_COPIES);
}

/**
 * Brings an older version of an entry back. The text as it stands is kept first, so a restore can
 * itself be undone. Visibility is not part of a version and is left as it is.
 */
export async function restoreEntityRevision(
  db: DbOrTx,
  worldId: string,
  entityId: string,
  revisionId: string,
  userId: string,
): Promise<Entity> {
  const subject: Subject = { kind: 'entity', id: entityId };
  const { content } = await getRevision<EntityRevisionContent>(db, worldId, subject, revisionId);
  await keepCurrent(db, worldId, subject, userId);
  const input = {
    name: content.name,
    aliases: content.aliases,
    summary: content.summary,
    body: content.body,
    startDay: content.startDay,
    endDay: content.endDay,
  } as z.output<typeof entityUpdateSchema>;
  try {
    const restored = await updateEntity(db, worldId, entityId, {
      ...input,
      fields: content.fields,
    });
    await keepRestored(db, worldId, subject, userId);
    return restored;
  } catch (error) {
    // A field the type no longer has (or now reads differently) must not block getting the text
    // back; the fields are then left as they are.
    if (!(error instanceof ZodError)) throw error;
    const restored = await updateEntity(db, worldId, entityId, input);
    await keepRestored(db, worldId, subject, userId);
    return restored;
  }
}

/** Brings an older version of a scene back (its title, summary and text). */
export async function restoreSceneRevision(
  db: DbOrTx,
  worldId: string,
  sceneId: string,
  revisionId: string,
  userId: string,
): Promise<void> {
  const subject: Subject = { kind: 'scene', id: sceneId };
  const { content } = await getRevision<SceneRevisionContent>(db, worldId, subject, revisionId);
  await keepCurrent(db, worldId, subject, userId);
  await updateNode(db, worldId, sceneId, { title: content.title, summary: content.summary });
  await saveSceneBody(db, worldId, sceneId, content.body as RichTextDoc | null);
  await keepRestored(db, worldId, subject, userId);
}

/** Whether a manuscript node is a scene; only scenes have a history. */
export async function isScene(db: DbOrTx, worldId: string, nodeId: string): Promise<boolean> {
  const [row] = await db
    .select({ kind: manuscriptNodes.kind })
    .from(manuscriptNodes)
    .where(and(eq(manuscriptNodes.id, nodeId), eq(manuscriptNodes.worldId, worldId)));
  return row?.kind === 'scene';
}
