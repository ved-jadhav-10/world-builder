import { createHash, randomBytes } from 'node:crypto';
import { and, asc, desc, eq, gt, isNull, lt, or, sql } from 'drizzle-orm';
import {
  INVITE_STATUS_MESSAGES,
  inviteStatus,
  type CreatedInvite,
  type Invite,
  type inviteCreateSchema,
  type InvitePreview,
  type InviteRole,
  type JoinResult,
  type Member,
  type Role,
} from '@atlas/shared';
import type { z } from 'zod';
import type { DbOrTx } from '../../db/client';
import { user, worldInvites, worldMembers, worlds } from '../../db/schema';
import { badRequest, gone, HttpError, notFound } from '../../errors';
import { toWorld } from '../worlds/service';

const hashToken = (token: string) => createHash('sha256').update(token).digest('hex');

/** The same answer for a link that never existed, was cancelled, or belongs to a deleted world. */
const invalidInvite = () => new HttpError(404, 'This invite link is not valid, or was cancelled.');

type InviteRow = typeof worldInvites.$inferSelect;

function toInvite(row: InviteRow, now = new Date()): Invite {
  return {
    id: row.id,
    role: row.role as InviteRole,
    label: row.label,
    uses: row.uses,
    maxUses: row.maxUses,
    expiresAt: row.expiresAt?.toISOString() ?? null,
    status: inviteStatus(row, now),
    createdAt: row.createdAt.toISOString(),
  };
}

// ---- Members ------------------------------------------------------------------------------

const ROLE_ORDER: Record<Role, number> = {
  owner: 0,
  editor: 1,
  commenter: 2,
  player: 3,
  reader: 4,
};

export async function listMembers(db: DbOrTx, worldId: string): Promise<Member[]> {
  const rows = await db
    .select({
      userId: user.id,
      name: user.name,
      email: user.email,
      role: worldMembers.role,
      joinedAt: worldMembers.createdAt,
    })
    .from(worldMembers)
    .innerJoin(user, eq(user.id, worldMembers.userId))
    .where(eq(worldMembers.worldId, worldId))
    .orderBy(asc(worldMembers.createdAt));
  return rows
    .map((r) => ({ ...r, joinedAt: r.joinedAt.toISOString() }))
    .sort((a, b) => ROLE_ORDER[a.role] - ROLE_ORDER[b.role]);
}

async function findMember(db: DbOrTx, worldId: string, userId: string) {
  const [row] = await db
    .select({ role: worldMembers.role })
    .from(worldMembers)
    .where(and(eq(worldMembers.worldId, worldId), eq(worldMembers.userId, userId)));
  if (!row) throw notFound('Member');
  return row;
}

export async function updateMemberRole(
  db: DbOrTx,
  worldId: string,
  userId: string,
  role: InviteRole,
): Promise<void> {
  const member = await findMember(db, worldId, userId);
  if (member.role === 'owner') throw badRequest("The owner's role can't be changed");
  await db
    .update(worldMembers)
    .set({ role })
    .where(and(eq(worldMembers.worldId, worldId), eq(worldMembers.userId, userId)));
}

/** Removes someone from a world. The owner can remove others; anyone can remove themselves. */
export async function removeMember(db: DbOrTx, worldId: string, userId: string): Promise<void> {
  const member = await findMember(db, worldId, userId);
  if (member.role === 'owner') {
    throw badRequest("The owner can't be removed. Delete the world instead.");
  }
  await db
    .delete(worldMembers)
    .where(and(eq(worldMembers.worldId, worldId), eq(worldMembers.userId, userId)));
}

// ---- Invites (managed by the owner) ----------------------------------------------------------

export async function listInvites(db: DbOrTx, worldId: string): Promise<Invite[]> {
  const rows = await db
    .select()
    .from(worldInvites)
    .where(eq(worldInvites.worldId, worldId))
    .orderBy(desc(worldInvites.createdAt));
  const now = new Date();
  return rows.map((row) => toInvite(row, now));
}

export async function createInvite(
  db: DbOrTx,
  worldId: string,
  userId: string,
  input: z.output<typeof inviteCreateSchema>,
): Promise<Omit<CreatedInvite, 'emailedTo'>> {
  const token = randomBytes(32).toString('base64url');
  const expiresAt =
    input.expiresInDays === null ? null : new Date(Date.now() + input.expiresInDays * 86_400_000);
  const [row] = await db
    .insert(worldInvites)
    .values({
      worldId,
      role: input.role,
      label: input.label,
      tokenHash: hashToken(token),
      maxUses: input.maxUses,
      expiresAt,
      createdBy: userId,
    })
    .returning();
  if (!row) throw new Error('Invite insert returned no row');
  return { ...toInvite(row), token };
}

/** Cancels a link. People who already joined with it stay in the world. */
export async function deleteInvite(db: DbOrTx, worldId: string, inviteId: string): Promise<void> {
  const deleted = await db
    .delete(worldInvites)
    .where(and(eq(worldInvites.id, inviteId), eq(worldInvites.worldId, worldId)))
    .returning({ id: worldInvites.id });
  if (!deleted.length) throw notFound('Invite');
}

// ---- Using a link -----------------------------------------------------------------------------

/** What the link is for, so someone can decide before signing in. Reveals nothing else. */
export async function previewInvite(db: DbOrTx, token: string): Promise<InvitePreview> {
  const [row] = await db
    .select({ invite: worldInvites, worldName: worlds.name, inviter: user.name })
    .from(worldInvites)
    .innerJoin(worlds, eq(worlds.id, worldInvites.worldId))
    .leftJoin(user, eq(user.id, worldInvites.createdBy))
    .where(and(eq(worldInvites.tokenHash, hashToken(token)), isNull(worlds.deletedAt)));
  if (!row) throw invalidInvite();

  const status = inviteStatus(row.invite);
  if (status !== 'active') throw gone(INVITE_STATUS_MESSAGES[status]);
  return {
    worldName: row.worldName,
    role: row.invite.role as InviteRole,
    invitedBy: row.inviter ?? 'The owner',
  };
}

/**
 * Adds the person to the world with the link's role. Someone who is already a member keeps the
 * role they have and uses up nothing. The use is claimed with one conditional UPDATE, so two
 * people racing for the last use cannot both win.
 */
export async function acceptInvite(db: DbOrTx, token: string, userId: string): Promise<JoinResult> {
  return db.transaction(async (tx) => {
    const [row] = await tx
      .select({ invite: worldInvites, world: worlds })
      .from(worldInvites)
      .innerJoin(worlds, eq(worlds.id, worldInvites.worldId))
      .where(and(eq(worldInvites.tokenHash, hashToken(token)), isNull(worlds.deletedAt)));
    if (!row) throw invalidInvite();
    const { invite, world } = row;

    const inserted = await tx
      .insert(worldMembers)
      .values({ worldId: world.id, userId, role: invite.role })
      .onConflictDoNothing()
      .returning({ userId: worldMembers.userId });

    if (!inserted.length) {
      const [existing] = await tx
        .select({ role: worldMembers.role })
        .from(worldMembers)
        .where(and(eq(worldMembers.worldId, world.id), eq(worldMembers.userId, userId)));
      return { world: toWorld(world, existing?.role ?? invite.role), joined: false };
    }

    const now = new Date();
    const claimed = await tx
      .update(worldInvites)
      .set({ uses: sql`${worldInvites.uses} + 1` })
      .where(
        and(
          eq(worldInvites.id, invite.id),
          or(isNull(worldInvites.maxUses), lt(worldInvites.uses, worldInvites.maxUses)),
          or(isNull(worldInvites.expiresAt), gt(worldInvites.expiresAt, now)),
        ),
      )
      .returning({ id: worldInvites.id });
    if (!claimed.length) {
      // Throwing rolls back the membership inserted above.
      const status = inviteStatus(invite, now);
      throw gone(INVITE_STATUS_MESSAGES[status === 'active' ? 'used_up' : status]);
    }
    return { world: toWorld(world, invite.role), joined: true };
  });
}
