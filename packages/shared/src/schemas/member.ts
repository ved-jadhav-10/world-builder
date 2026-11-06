import { z } from 'zod';
import type { Role } from './common';

/** Roles that can be handed out. Nobody is invited as an owner. */
export const INVITE_ROLES = ['editor', 'commenter', 'player', 'reader'] as const;
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
  /** People to email the link to. The link itself works for anyone who holds it, not just them. */
  emails: z
    .array(z.string().trim().toLowerCase().pipe(z.email().max(254)))
    .max(10)
    .default([]),
});
export type InviteCreateInput = z.input<typeof inviteCreateSchema>;

export const memberUpdateSchema = z.object({ role: inviteRoleSchema });
export type MemberUpdateInput = z.input<typeof memberUpdateSchema>;

/** Handing the world to another member; the old owner becomes a co-GM. */
export const transferOwnershipSchema = z.object({ userId: z.string().min(1).max(200) });

export const MEMBER_EVENT_KINDS = [
  'joined',
  'role_changed',
  'removed',
  'left',
  'ownership_transferred',
] as const;
export type MemberEventKind = (typeof MEMBER_EVENT_KINDS)[number];

export interface MemberEvent {
  id: string;
  kind: MemberEventKind;
  userName: string;
  role: Role | null;
  detail: string;
  actorName: string | null;
  createdAt: string;
}

/** The secret in an invite link. Generated as 32 random bytes, base64url-encoded. */
export const inviteTokenSchema = z
  .string()
  .min(20)
  .max(100)
  .regex(/^[A-Za-z0-9_-]+$/);

/** How a role is named to people. The "editor" role is the co-GM. */
export const ROLE_LABELS: Record<Role, string> = {
  owner: 'Owner',
  editor: 'Co-GM',
  commenter: 'Commenter',
  reader: 'Reader',
  player: 'Player',
};

export const INVITE_ROLE_INFO: Record<InviteRole, { label: string; description: string }> = {
  player: {
    label: ROLE_LABELS.player,
    description: 'Sees the entries, maps, pins, quests and pictures you share with players.',
  },
  reader: {
    label: ROLE_LABELS.reader,
    description: 'Sees only what you share with readers, such as lore for beta readers.',
  },
  commenter: {
    label: ROLE_LABELS.commenter,
    description: 'Sees what readers see and can leave comments on entries.',
  },
  editor: {
    label: ROLE_LABELS.editor,
    description: 'Sees and edits everything, including secrets and the manuscript.',
  },
};
