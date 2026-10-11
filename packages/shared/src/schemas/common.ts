import { z } from 'zod';

export const VISIBILITIES = ['public', 'reader', 'player', 'gm', 'hidden'] as const;
export type Visibility = (typeof VISIBILITIES)[number];
export const visibilitySchema = z.enum(VISIBILITIES);

export const ROLES = ['owner', 'editor', 'commenter', 'reader', 'player'] as const;
export type Role = (typeof ROLES)[number];

/** Higher rank = more power. Readers and players are separate audiences with equal (read) power. */
export const ROLE_RANK: Record<Role, number> = {
  player: 1,
  reader: 1,
  commenter: 2,
  editor: 3,
  owner: 4,
};

export function hasRole(role: Role, minRole: Role): boolean {
  return ROLE_RANK[role] >= ROLE_RANK[minRole];
}

export const idSchema = z.uuid();
export const colorSchema = z.string().regex(/^#[0-9a-fA-F]{6}$/, 'Use a hex colour like #a1b2c3');
export const iconSchema = z.string().trim().min(1).max(40);

export const worldParamsSchema = z.object({ worldId: idSchema });
export const worldItemParamsSchema = z.object({ worldId: idSchema, id: idSchema });
