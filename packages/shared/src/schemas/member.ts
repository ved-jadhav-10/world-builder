import { z } from 'zod';

/**
 * Roles that can be handed out. Nobody is invited as an owner, and commenters have no features
 * of their own yet (they see what readers see), so they aren't offered.
 */
export const INVITE_ROLES = ['editor', 'player', 'reader'] as const;
export type InviteRole = (typeof INVITE_ROLES)[number];
export const inviteRoleSchema = z.enum(INVITE_ROLES);

export const inviteCreateSchema = z.object({
  role: inviteRoleSchema,
  /** A note for the owner, such as "Tuesday group". */
  label: z.string().trim().max(80).default(''),
  /** Null = any number of people can use the link. */
  maxUses: z.number().int().min(1).max(500).nullable().default(null),
  /** Null = the link never expires. */
  expiresInDays: z.number().int().min(1).max(365).nullable().default(7),
});
export type InviteCreateInput = z.input<typeof inviteCreateSchema>;

export const memberUpdateSchema = z.object({ role: inviteRoleSchema });
export type MemberUpdateInput = z.input<typeof memberUpdateSchema>;

/** The secret in an invite link. Generated as 32 random bytes, base64url-encoded. */
export const inviteTokenSchema = z
  .string()
  .min(20)
  .max(100)
  .regex(/^[A-Za-z0-9_-]+$/);

export const INVITE_ROLE_INFO: Record<InviteRole, { label: string; description: string }> = {
  player: {
    label: 'Player',
    description: 'Sees the entries, maps, pins, quests and pictures you share with players.',
  },
  reader: {
    label: 'Reader',
    description: 'Sees only what you share with readers, such as lore for beta readers.',
  },
  editor: {
    label: 'Co-GM',
    description: 'Sees and edits everything, including secrets and the manuscript.',
  },
};
