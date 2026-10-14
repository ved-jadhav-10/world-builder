import { describe, expect, it } from 'vitest';
import { inviteStatus } from './invites';
import { inviteCreateSchema, inviteTokenSchema, INVITE_ROLES } from './schemas/member';

const now = new Date('2026-10-13T12:00:00Z');

describe('inviteStatus', () => {
  it('is active with no limits, or while both limits hold', () => {
    expect(inviteStatus({ uses: 99, maxUses: null, expiresAt: null }, now)).toBe('active');
    expect(inviteStatus({ uses: 2, maxUses: 3, expiresAt: '2026-10-14T00:00:00Z' }, now)).toBe(
      'active',
    );
  });

  it('expires at the stated moment, not after it', () => {
    expect(inviteStatus({ uses: 0, maxUses: null, expiresAt: '2026-10-13T12:00:01Z' }, now)).toBe(
      'active',
    );
    expect(inviteStatus({ uses: 0, maxUses: null, expiresAt: '2026-10-13T12:00:00Z' }, now)).toBe(
      'expired',
    );
    expect(inviteStatus({ uses: 0, maxUses: null, expiresAt: new Date('2026-01-01') }, now)).toBe(
      'expired',
    );
  });

  it('is used up once every use is taken', () => {
    expect(inviteStatus({ uses: 3, maxUses: 3, expiresAt: null }, now)).toBe('used_up');
    expect(inviteStatus({ uses: 4, maxUses: 3, expiresAt: null }, now)).toBe('used_up');
  });

  it('calls an invite that is both expired and used up expired', () => {
    expect(inviteStatus({ uses: 3, maxUses: 3, expiresAt: '2020-01-01T00:00:00Z' }, now)).toBe(
      'expired',
    );
  });
});

describe('invite input', () => {
  it('defaults to a week with no use limit, and keeps explicit nulls as "never"', () => {
    expect(inviteCreateSchema.parse({ role: 'player' })).toEqual({
      role: 'player',
      label: '',
      maxUses: null,
      expiresInDays: 7,
      emails: [],
    });
    expect(inviteCreateSchema.parse({ role: 'reader', expiresInDays: null }).expiresInDays).toBe(
      null,
    );
  });

  it('tidies emailed addresses and caps how many can be sent at once', () => {
    const parsed = inviteCreateSchema.parse({ role: 'player', emails: ['  Ana@Example.COM '] });
    expect(parsed.emails).toEqual(['ana@example.com']);
    expect(inviteCreateSchema.safeParse({ role: 'player', emails: ['nope'] }).success).toBe(false);
    const eleven = Array.from({ length: 11 }, (_, i) => `p${i}@example.com`);
    expect(inviteCreateSchema.safeParse({ role: 'player', emails: eleven }).success).toBe(false);
  });

  it('never offers the owner role, and rejects silly limits', () => {
    expect(INVITE_ROLES).not.toContain('owner');
    expect(inviteCreateSchema.safeParse({ role: 'owner' }).success).toBe(false);
    expect(inviteCreateSchema.safeParse({ role: 'player', maxUses: 0 }).success).toBe(false);
    expect(inviteCreateSchema.safeParse({ role: 'player', expiresInDays: 400 }).success).toBe(
      false,
    );
  });

  it('only accepts tokens shaped like the ones the API makes', () => {
    expect(inviteTokenSchema.safeParse('A'.repeat(43)).success).toBe(true);
    expect(inviteTokenSchema.safeParse('short').success).toBe(false);
    expect(inviteTokenSchema.safeParse(`${'A'.repeat(30)}/../etc`).success).toBe(false);
  });
});
