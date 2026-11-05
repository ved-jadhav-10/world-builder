import { and, asc, count, desc, eq, inArray, isNotNull, isNull, sql, type SQL } from 'drizzle-orm';
import type { z } from 'zod';
import {
  canSee,
  hasRole,
  MAX_COMMENTS_PER_SUBJECT,
  type Audience,
  type Comment,
  type commentCreateSchema,
  type commentUpdateSchema,
  type InboxThread,
  type Role,
} from '@atlas/shared';
import { user } from '../../db/auth-schema';
import type { DbOrTx } from '../../db/client';
import { comments, entities, manuscriptNodes } from '../../db/schema';
import { badRequest, conflict, forbidden, notFound } from '../../errors';
import { visibleTo } from '../../lib/visibility';

export type Subject = { kind: 'entity' | 'scene'; id: string };

/** Who is acting, for the rules about editing and removing other people's comments. */
export interface Actor {
  userId: string;
  role: Role;
  audience: Audience;
}

type Row = {
  comment: typeof comments.$inferSelect;
  authorName: string | null;
};

function toComment({ comment, authorName }: Row): Comment {
  return {
    id: comment.id,
    parentId: comment.parentId,
    entityId: comment.entityId,
    nodeId: comment.nodeId,
    author: comment.authorId ? { id: comment.authorId, name: authorName ?? 'Someone' } : null,
    body: comment.body,
    resolvedAt: comment.resolvedAt?.toISOString() ?? null,
    editedAt: comment.editedAt?.toISOString() ?? null,
    createdAt: comment.createdAt.toISOString(),
  };
}

const selectComments = (db: DbOrTx) =>
  db
    .select({ comment: comments, authorName: user.name })
    .from(comments)
    .leftJoin(user, eq(user.id, comments.authorId));

const subjectWhere = (worldId: string, subject: Subject): SQL =>
  and(
    eq(comments.worldId, worldId),
    subject.kind === 'entity' ? eq(comments.entityId, subject.id) : eq(comments.nodeId, subject.id),
  )!;

/**
 * The thing being discussed must exist and be something this person may see: an entry that is
 * live and visible to their audience, or a scene (which only the GM side can see).
 */
async function assertSubject(db: DbOrTx, worldId: string, subject: Subject, audience: Audience) {
  if (subject.kind === 'entity') {
    const [found] = await db
      .select({ id: entities.id })
      .from(entities)
      .where(
        and(
          eq(entities.id, subject.id),
          eq(entities.worldId, worldId),
          isNull(entities.deletedAt),
          visibleTo(entities.visibility, audience),
        ),
      );
    if (!found) throw notFound('Entry');
    return;
  }
  const [found] = await db
    .select({ id: manuscriptNodes.id })
    .from(manuscriptNodes)
    .where(
      and(
        eq(manuscriptNodes.id, subject.id),
        eq(manuscriptNodes.worldId, worldId),
        eq(manuscriptNodes.kind, 'scene'),
      ),
    );
  if (!found || audience !== 'gm') throw notFound('Scene');
}

export async function listComments(
  db: DbOrTx,
  worldId: string,
  subject: Subject,
  audience: Audience,
): Promise<Comment[]> {
  await assertSubject(db, worldId, subject, audience);
  const rows = await selectComments(db)
    .where(subjectWhere(worldId, subject))
    .orderBy(asc(comments.createdAt), asc(comments.id));
  return rows.map(toComment);
}

export async function createComment(
  db: DbOrTx,
  worldId: string,
  subject: Subject,
  actor: Actor,
  input: z.output<typeof commentCreateSchema>,
): Promise<Comment> {
  await assertSubject(db, worldId, subject, actor.audience);
  if (input.parentId) {
    const [parent] = await db
      .select({ id: comments.id, parentId: comments.parentId })
      .from(comments)
      .where(and(eq(comments.id, input.parentId), subjectWhere(worldId, subject)));
    if (!parent) throw notFound('Comment');
    if (parent.parentId !== null) throw badRequest('Reply to the start of the thread');
  }
  const [{ total } = { total: 0 }] = await db
    .select({ total: count() })
    .from(comments)
    .where(subjectWhere(worldId, subject));
  if (total >= MAX_COMMENTS_PER_SUBJECT) {
    throw conflict(`There are already ${MAX_COMMENTS_PER_SUBJECT} comments here.`);
  }
  const [row] = await db
    .insert(comments)
    .values({
      worldId,
      entityId: subject.kind === 'entity' ? subject.id : null,
      nodeId: subject.kind === 'scene' ? subject.id : null,
      parentId: input.parentId,
      authorId: actor.userId,
      body: input.body,
    })
    .returning({ id: comments.id });
  return getComment(db, worldId, row!.id);
}

async function getRow(db: DbOrTx, worldId: string, id: string): Promise<Row> {
  const [row] = await selectComments(db).where(
    and(eq(comments.id, id), eq(comments.worldId, worldId)),
  );
  if (!row) throw notFound('Comment');
  return row;
}

async function getComment(db: DbOrTx, worldId: string, id: string): Promise<Comment> {
  return toComment(await getRow(db, worldId, id));
}

/** Loads a comment and checks the person can still see what it is about. */
async function getVisibleRow(db: DbOrTx, worldId: string, id: string, audience: Audience) {
  const row = await getRow(db, worldId, id);
  const { entityId, nodeId } = row.comment;
  const subject: Subject = entityId
    ? { kind: 'entity', id: entityId }
    : { kind: 'scene', id: nodeId! };
  await assertSubject(db, worldId, subject, audience);
  return row;
}

export async function updateComment(
  db: DbOrTx,
  worldId: string,
  id: string,
  actor: Actor,
  input: z.output<typeof commentUpdateSchema>,
): Promise<Comment> {
  const { comment } = await getVisibleRow(db, worldId, id, actor.audience);
  const isAuthor = comment.authorId === actor.userId;
  const set: Partial<typeof comments.$inferInsert> = {};

  if (input.body !== undefined) {
    // Nobody rewrites what someone else said, not even the owner; they can remove it instead.
    if (!isAuthor) throw forbidden('You can only edit your own comments');
    if (input.body !== comment.body) {
      set.body = input.body;
      set.editedAt = new Date();
    }
  }
  if (input.resolved !== undefined) {
    if (comment.parentId !== null) throw badRequest('Resolve the thread, not a single reply');
    if (!isAuthor && !hasRole(actor.role, 'editor')) {
      throw forbidden('Only the author or a co-GM can resolve this thread');
    }
    if (input.resolved !== (comment.resolvedAt !== null)) {
      set.resolvedAt = input.resolved ? new Date() : null;
    }
  }
  if (Object.keys(set).length > 0) {
    await db
      .update(comments)
      .set(set)
      .where(and(eq(comments.id, id), eq(comments.worldId, worldId)));
  }
  return getComment(db, worldId, id);
}

/** The author, or a co-GM or the owner. Removing the first comment of a thread removes its replies. */
export async function deleteComment(
  db: DbOrTx,
  worldId: string,
  id: string,
  actor: Actor,
): Promise<void> {
  const { comment } = await getVisibleRow(db, worldId, id, actor.audience);
  if (comment.authorId !== actor.userId && !hasRole(actor.role, 'editor')) {
    throw forbidden('You can only remove your own comments');
  }
  await db.delete(comments).where(and(eq(comments.id, id), eq(comments.worldId, worldId)));
}

/**
 * Threads across the world for the comment inbox, newest activity first. Only threads about
 * something the person can see are listed.
 */
export async function listInbox(
  db: DbOrTx,
  worldId: string,
  audience: Audience,
  status: 'open' | 'resolved' | 'all',
): Promise<InboxThread[]> {
  const statusWhere =
    status === 'open'
      ? isNull(comments.resolvedAt)
      : status === 'resolved'
        ? isNotNull(comments.resolvedAt)
        : undefined;
  const rows = await db
    .select({
      comment: comments,
      authorName: user.name,
      entityName: entities.name,
      entityType: entities.typeId,
      entityVisibility: entities.visibility,
      sceneTitle: manuscriptNodes.title,
    })
    .from(comments)
    .leftJoin(user, eq(user.id, comments.authorId))
    .leftJoin(entities, and(eq(entities.id, comments.entityId), isNull(entities.deletedAt)))
    .leftJoin(manuscriptNodes, eq(manuscriptNodes.id, comments.nodeId))
    .where(and(eq(comments.worldId, worldId), isNull(comments.parentId), statusWhere))
    .orderBy(desc(comments.createdAt), desc(comments.id));

  const visible = rows.filter((row) => {
    if (row.comment.entityId) {
      // A trashed entry has no row from the join.
      return row.entityName !== null && canSee(audience, row.entityVisibility!);
    }
    return audience === 'gm' && row.sceneTitle !== null;
  });
  if (visible.length === 0) return [];

  const counts = await db
    .select({ parentId: comments.parentId, replies: sql<number>`count(*)::int` })
    .from(comments)
    .where(
      inArray(
        comments.parentId,
        visible.map((row) => row.comment.id),
      ),
    )
    .groupBy(comments.parentId);
  const replyCount = new Map(counts.map((c) => [c.parentId, c.replies]));

  return visible.map((row) => ({
    comment: toComment(row),
    replyCount: replyCount.get(row.comment.id) ?? 0,
    subject: row.comment.entityId
      ? {
          kind: 'entity' as const,
          id: row.comment.entityId,
          title: row.entityName!,
          typeId: row.entityType,
        }
      : { kind: 'scene' as const, id: row.comment.nodeId!, title: row.sceneTitle!, typeId: null },
  }));
}

/** Every comment in the world, oldest first, for the export. Comments on trashed entries wait with them. */
export async function listAllComments(db: DbOrTx, worldId: string): Promise<Comment[]> {
  const rows = await selectComments(db)
    .leftJoin(entities, eq(entities.id, comments.entityId))
    .where(and(eq(comments.worldId, worldId), isNull(entities.deletedAt)))
    .orderBy(asc(comments.createdAt), asc(comments.id));
  return rows.map(toComment);
}
