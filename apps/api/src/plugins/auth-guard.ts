import type { FastifyReply, FastifyRequest } from 'fastify';
import { and, eq, isNull } from 'drizzle-orm';
import { fromNodeHeaders } from 'better-auth/node';
import { z } from 'zod';
import {
  audienceForRole,
  hasRole,
  isPreviewAudience,
  VIEW_AS_HEADER,
  type Audience,
  type Role,
} from '@atlas/shared';
import { auth, type SessionUser } from '../auth';
import { db } from '../db/client';
import { worldMembers, worlds } from '../db/schema';
import { badRequest, forbidden, notFound, unauthorized } from '../errors';

declare module 'fastify' {
  interface FastifyRequest {
    user: SessionUser | null;
    /**
     * Set for routes under /api/worlds/:worldId. `audience` is who is looking: the GM for owners
     * and editors, or a player or reader. A GM can preview another audience; that is read-only.
     */
    world: { id: string; role: Role; audience: Audience; previewing: boolean } | null;
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

  const audience = audienceForRole(membership.role);
  const viewAs = request.headers[VIEW_AS_HEADER];
  if (viewAs === undefined || viewAs === 'gm') {
    request.world = { id: parsed.data, role: membership.role, audience, previewing: false };
    return;
  }
  if (!isPreviewAudience(viewAs)) throw badRequest('Unknown view');
  // Only a GM can look at the world as someone else. Other members already see their own view.
  request.world =
    audience === 'gm'
      ? { id: parsed.data, role: membership.role, audience: viewAs, previewing: true }
      : { id: parsed.data, role: membership.role, audience, previewing: false };
}

/** Route-level guard for actions that need more than read access. */
export function requireRole(minRole: Role) {
  return async (request: FastifyRequest, _reply: FastifyReply) => {
    if (!request.world || !hasRole(request.world.role, minRole)) throw forbidden();
    // Previews show what others see, so they can't be used to change anything.
    if (request.world.previewing) {
      throw forbidden('You are previewing the world as someone else. Switch back to make changes.');
    }
  };
}

/** Route-level guard for things only the GM's own view may use, such as the manuscript. */
export function requireAudience(...allowed: Audience[]) {
  return async (request: FastifyRequest, _reply: FastifyReply) => {
    if (!request.world || !allowed.includes(request.world.audience)) {
      throw forbidden('That is not available in this view');
    }
  };
}

/** Narrowing helpers for handlers that run behind the guards above. */
export function currentUser(request: FastifyRequest): SessionUser {
  if (!request.user) throw unauthorized();
  return request.user;
}

export function currentAudience(request: FastifyRequest): Audience {
  if (!request.world) throw notFound('World');
  return request.world.audience;
}

export function currentWorldId(request: FastifyRequest): string {
  if (!request.world) throw notFound('World');
  return request.world.id;
}
