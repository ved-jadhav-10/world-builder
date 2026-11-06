import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { CreatedInvite, Member, MemberEvent, World } from '@atlas/shared';
import { buildApp } from '../src/app';
import { outbox } from '../src/lib/mailer';
import { joinWorld, signUp, signUpWithWorld, type TestApp } from './helpers';

let app: TestApp;
beforeAll(async () => {
  app = await buildApp();
});
afterAll(() => app.close());
beforeEach(() => {
  outbox.length = 0;
});

const membersOf = async (gm: Awaited<ReturnType<typeof signUpWithWorld>>) =>
  (await gm.api.get(`${gm.w}/members`)).json<Member[]>();
const eventsOf = async (gm: Awaited<ReturnType<typeof signUpWithWorld>>) =>
  (await gm.api.get(`${gm.w}/member-events`)).json<MemberEvent[]>();

describe('handing over ownership', () => {
  it('makes the chosen member the owner and the old owner a co-GM', async () => {
    const gm = await signUpWithWorld(app);
    const heir = await joinWorld(app, gm.world.id, 'player');
    const heirId = (await membersOf(gm)).find((m) => m.email === heir.email)!.userId;

    const res = await gm.api.post(`${gm.w}/transfer-ownership`, { userId: heirId });
    expect(res.statusCode, res.body).toBe(204);

    const members = await membersOf({ ...gm, api: heir.api });
    expect(members.find((m) => m.userId === heirId)!.role).toBe('owner');
    expect(members.find((m) => m.email === gm.email)!.role).toBe('editor');

    // The new owner now manages people; the old one no longer does.
    expect((await heir.api.get(`${gm.w}/members`)).statusCode).toBe(200);
    expect((await gm.api.get(`${gm.w}/members`)).statusCode).toBe(403);
    const worlds = (await heir.api.get('/worlds')).json<World[]>();
    expect(worlds.find((w) => w.id === gm.world.id)!.role).toBe('owner');

    const events = await eventsOf({ ...gm, api: heir.api });
    expect(events[0]).toMatchObject({ kind: 'ownership_transferred', role: 'owner' });
  });

  it('refuses strangers, yourself and non-members, and is owner only', async () => {
    const gm = await signUpWithWorld(app);
    const coGm = await joinWorld(app, gm.world.id, 'editor');
    const members = await membersOf(gm);
    const me = members.find((m) => m.email === gm.email)!.userId;
    const other = await signUp(app);

    expect((await gm.api.post(`${gm.w}/transfer-ownership`, { userId: me })).statusCode).toBe(400);
    expect((await gm.api.post(`${gm.w}/transfer-ownership`, { userId: 'nobody' })).statusCode).toBe(
      404,
    );
    const coGmId = members.find((m) => m.email === coGm.email)!.userId;
    expect((await coGm.api.post(`${gm.w}/transfer-ownership`, { userId: coGmId })).statusCode).toBe(
      403,
    );
    expect((await other.api.post(`${gm.w}/transfer-ownership`, { userId: me })).statusCode).toBe(
      404,
    );
    expect((await membersOf(gm)).find((m) => m.userId === me)!.role).toBe('owner');
  });
});

describe('the member trail and the join notice', () => {
  it('records joins, role changes and removals, and mails the owner on a join', async () => {
    const gm = await signUpWithWorld(app);
    const link = (
      await gm.api.post(`${gm.w}/invites`, { role: 'player', label: 'Tuesday group' })
    ).json<CreatedInvite>();
    const guest = await signUp(app, 'Pippa Guest');
    expect((await guest.api.post(`/invites/${link.token}/accept`)).statusCode).toBe(200);

    expect(outbox).toHaveLength(1);
    expect(outbox[0]!.to).toBe(gm.email);
    expect(outbox[0]!.subject).toContain('Pippa Guest joined');

    // Using the link again changes nothing and sends nothing.
    await guest.api.post(`/invites/${link.token}/accept`);
    expect(outbox).toHaveLength(1);

    const guestId = (await membersOf(gm)).find((m) => m.email === guest.email)!.userId;
    await gm.api.patch(`${gm.w}/members/${guestId}`, { role: 'reader' });
    await gm.api.patch(`${gm.w}/members/${guestId}`, { role: 'reader' });
    await gm.api.delete(`${gm.w}/members/${guestId}`);

    const events = await eventsOf(gm);
    expect(events.map((e) => e.kind)).toEqual(['removed', 'role_changed', 'joined']);
    expect(events[2]).toMatchObject({
      userName: 'Pippa Guest',
      role: 'player',
      detail: 'Tuesday group',
    });
    expect(events[1]).toMatchObject({ detail: 'Player to Reader', actorName: 'Test User' });
  });

  it('notes when someone leaves, and is for the owner only', async () => {
    const gm = await signUpWithWorld(app);
    const player = await joinWorld(app, gm.world.id, 'player');
    expect((await player.api.delete(`${gm.w}/members/me`)).statusCode).toBe(204);
    expect((await eventsOf(gm))[0]).toMatchObject({ kind: 'left', actorName: null });
    const coGm = await joinWorld(app, gm.world.id, 'editor');
    expect((await coGm.api.get(`${gm.w}/member-events`)).statusCode).toBe(403);
  });
});
