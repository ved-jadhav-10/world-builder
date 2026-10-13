import type { InviteStatus } from './types';

/**
 * Whether an invite link can still be used. An invite that was cancelled no longer exists, so
 * there is no status for it. The API makes the same checks atomically when someone joins; this
 * is for explaining the state to people.
 */
export function inviteStatus(
  invite: { uses: number; maxUses: number | null; expiresAt: Date | string | null },
  now: Date = new Date(),
): InviteStatus {
  if (invite.expiresAt !== null && new Date(invite.expiresAt).getTime() <= now.getTime()) {
    return 'expired';
  }
  if (invite.maxUses !== null && invite.uses >= invite.maxUses) return 'used_up';
  return 'active';
}

export const INVITE_STATUS_MESSAGES: Record<Exclude<InviteStatus, 'active'>, string> = {
  expired: 'This invite link has expired. Ask the person who sent it for a new one.',
  used_up: 'This invite link has already been used the most times it allows. Ask for a new one.',
};
