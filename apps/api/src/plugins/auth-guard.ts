import type { FastifyReply, FastifyRequest } from 'fastify';
import { and, eq, isNull } from 'drizzle-orm';
import { fromNodeHeaders } from 'better-auth/node';
import { z } from 'zod';
import { hasRole, type Role } from '@atlas/shared';
import { auth, type SessionUser } from '../auth';
import { db } from '../db/client';
import { worldMembers, worlds } from '../db/schema';
import { forbidden, notFound, unauthorized } from '../errors';

declare module 'fastify' {
  interface FastifyRequest {
    user: SessionUser | null;
    /** Set for routes under /api/worlds/:worldId. */
    world: { id: string; role: Role } | null;
  }
}

export async function requireSession(request: FastifyRequest) {
  const session = await auth.api.getSession({ headers: fromNodeHeaders(request.headers) });
  if (!session) throw unauthorized();
  request.user = session.user;
}

const worldIdSchema = z.uuid();

/**
 * Loads the caller's membership for :worldId. Non-members get 404 rather than 403,
 * so world IDs can't be probed for existence.
 */
export async function requireWorldMember(request: FastifyRequest) {
  const { worldId } = request.params as { worldId?: string };
  const parsed = worldIdSchema.safeParse(worldId);
  if (!parsed.success || !request.user) throw notFound('World');

  const [membership] = await db
    .select({ role: worldMembers.role })
    .from(worldMembers)
    .innerJoin(worlds, eq(worlds.id, worldMembers.worldId))
    .where(
      and(
        eq(worldMembers.worldId, parsed.data),
        eq(worldMembers.userId, request.user.id),
        isNull(worlds.deletedAt),
      ),
    );
  if (!membership) throw notFound('World');
  request.world = { id: parsed.data, role: membership.role };
}

/** Route-level guard for actions that need more than read access. */
export function requireRole(minRole: Role) {
  return async (request: FastifyRequest, _reply: FastifyReply) => {
    if (!request.world || !hasRole(request.world.role, minRole)) throw forbidden();
  };
}

/** Narrowing helpers for handlers that run behind the guards above. */
export function currentUser(request: FastifyRequest): SessionUser {
  if (!request.user) throw unauthorized();
  return request.user;
}

export function currentWorldId(request: FastifyRequest): string {
  if (!request.world) throw notFound('World');
  return request.world.id;
}
