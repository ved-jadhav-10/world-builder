import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  MAX_GM_WIDGETS,
  MAX_SCRATCHPAD,
  type Entity,
  type GmScreen,
  type GmWidget,
} from '@atlas/shared';
import { buildApp } from '../src/app';
import { apiClient, joinWorld, signUpWithWorld, type TestApp } from './helpers';

let app: TestApp;
beforeAll(async () => {
  app = await buildApp();
});
afterAll(() => app.close());

async function setup() {
  const ctx = await signUpWithWorld(app);
  const coGm = await joinWorld(app, ctx.world.id, 'editor');
  const player = await joinWorld(app, ctx.world.id, 'player');
  const reader = await joinWorld(app, ctx.world.id, 'reader');
  const url = `${ctx.w}/gm-screen`;
  const get = async (api = ctx.api) => (await api.get(url)).json<GmScreen>();
  const save = (widgets: object[], api = ctx.api) => api.put(url, { widgets });
  const entity = async (name: string, extra: object = {}) =>
    (
      await ctx.api.post(`${ctx.w}/entities`, { typeId: ctx.typeId('character'), name, ...extra })
    ).json<Entity>();
  return { ...ctx, coGm, player, reader, url, get, save, entity };
}

describe('GM screen', () => {
  it('starts with dice, the current session and a scratchpad', async () => {
    const { get } = await setup();
    const screen = await get();
    expect(screen.widgets.map((w) => w.type)).toEqual(['dice', 'session', 'notes']);
    expect(screen.entries).toEqual([]);
  });

  it('saves the arrangement, in order, and gives it back', async () => {
    const { get, save } = await setup();
    const widgets: GmWidget[] = [
      { id: 'a', type: 'notes', title: 'Tonight', text: 'Heist at dusk' },
      { id: 'b', type: 'clock', title: 'Alarm', segments: 6, filled: 2 },
      { id: 'c', type: 'table', title: '', tableId: null },
      { id: 'd', type: 'dice', title: '' },
    ];
    const res = await save(widgets);
    expect(res.statusCode, res.body).toBe(200);
    expect(res.json<GmScreen>().widgets).toEqual(widgets);
    expect((await get()).widgets).toEqual(widgets);
    // Saving again replaces it, rather than adding to it.
    await save([{ id: 'only', type: 'session', title: '' }]);
    expect((await get()).widgets.map((w) => w.id)).toEqual(['only']);
    // An empty screen is allowed, and stays empty rather than going back to the starter set.
    await save([]);
    expect((await get()).widgets).toEqual([]);
  });

  it('keeps each GM’s screen to themselves', async () => {
    const { get, save, coGm } = await setup();
    await save([{ id: 'mine', type: 'notes', title: 'Mine', text: 'secret' }]);
    const theirs = await get(coGm.api);
    expect(theirs.widgets.map((w) => w.type)).toEqual(['dice', 'session', 'notes']);
    await save([{ id: 'theirs', type: 'dice', title: '' }], coGm.api);
    expect((await get()).widgets.map((w) => w.id)).toEqual(['mine']);
    expect((await get(coGm.api)).widgets.map((w) => w.id)).toEqual(['theirs']);
  });

  it('is separate in every world', async () => {
    const a = await setup();
    const b = await signUpWithWorld(app, 'Elsewhere');
    await a.save([{ id: 'x', type: 'dice', title: '' }]);
    // Another person's world answers 404, and your own other world is not affected.
    expect((await b.api.get(`${a.w}/gm-screen`)).statusCode).toBe(404);
    expect((await b.api.put(`${a.w}/gm-screen`, { widgets: [] })).statusCode).toBe(404);
    const own = (await b.api.get(`${b.w}/gm-screen`)).json<GmScreen>();
    expect(own.widgets.map((w) => w.type)).toEqual(['dice', 'session', 'notes']);
  });

  it('resolves pinned entries, including GM-only ones, and drops trashed ones', async () => {
    const { api, w, get, save, entity } = await setup();
    const mira = await entity('Mira', { visibility: 'player', summary: 'A pilot' });
    const secret = await entity('Lord Secret');
    const gone = await entity('Gone');
    await save([
      { id: 'p', type: 'entries', title: 'NPCs', entityIds: [secret.id, mira.id, gone.id] },
    ]);
    expect((await get()).entries.map((e) => e.name).sort()).toEqual([
      'Gone',
      'Lord Secret',
      'Mira',
    ]);
    expect((await get()).entries.find((e) => e.name === 'Mira')).toMatchObject({
      summary: 'A pilot',
      visibility: 'player',
    });
    await api.delete(`${w}/entities/${gone.id}`);
    const after = await get();
    expect(after.entries.map((e) => e.name).sort()).toEqual(['Lord Secret', 'Mira']);
    // The pin itself is kept, so restoring the entry brings it back.
    expect((after.widgets[0] as { entityIds: string[] }).entityIds).toHaveLength(3);
  });

  it('does not resolve entries from another world', async () => {
    const mine = await setup();
    const other = await signUpWithWorld(app, 'Elsewhere');
    const theirs = (
      await other.api.post(`${other.w}/entities`, {
        typeId: other.typeId('character'),
        name: 'Foreign',
      })
    ).json<Entity>();
    await mine.save([{ id: 'p', type: 'entries', title: '', entityIds: [theirs.id] }]);
    expect((await mine.get()).entries).toEqual([]);
  });

  it('keeps an initiative tracker as it was saved', async () => {
    const { save, get } = await setup();
    const widget = {
      id: 'fight',
      type: 'initiative',
      title: '',
      round: 3,
      turn: 1,
      combatants: [
        {
          id: 'a',
          name: 'Mira',
          initiative: 18,
          hp: 22,
          maxHp: 30,
          conditions: ['Prone'],
          entityId: null,
        },
        {
          id: 'b',
          name: 'Ogre',
          initiative: null,
          hp: null,
          maxHp: null,
          conditions: [],
          entityId: null,
        },
      ],
    };
    expect((await save([widget])).statusCode).toBe(200);
    expect((await get()).widgets).toEqual([widget]);
    const withHpOverMax = { ...widget, combatants: [{ ...widget.combatants[0], hp: 31 }] };
    expect((await save([withHpOverMax])).statusCode).toBe(400);
    const unnamed = { ...widget, combatants: [{ ...widget.combatants[0], name: ' ' }] };
    expect((await save([unnamed])).statusCode).toBe(400);
  });

  it('refuses a screen that does not make sense', async () => {
    const { save } = await setup();
    const bad = async (widgets: object[]) => (await save(widgets)).statusCode;
    expect(
      await bad([
        { id: 'a', type: 'dice' },
        { id: 'a', type: 'dice' },
      ]),
    ).toBe(400);
    expect(await bad([{ id: 'a', type: 'toaster' }])).toBe(400);
    expect(await bad([{ id: '', type: 'dice' }])).toBe(400);
    expect(await bad([{ id: 'a', type: 'clock', segments: 4, filled: 5 }])).toBe(400);
    expect(await bad([{ id: 'a', type: 'clock', segments: 1, filled: 0 }])).toBe(400);
    expect(await bad([{ id: 'a', type: 'table', tableId: 'nope' }])).toBe(400);
    expect(await bad([{ id: 'a', type: 'entries', entityIds: ['nope'] }])).toBe(400);
    expect(await bad([{ id: 'a', type: 'notes', text: 'x'.repeat(MAX_SCRATCHPAD + 1) }])).toBe(400);
    expect(
      await bad(
        Array.from({ length: MAX_GM_WIDGETS + 1 }, (_, i) => ({ id: `w${i}`, type: 'dice' })),
      ),
    ).toBe(400);
    expect(
      (
        await save(
          Array.from({ length: MAX_GM_WIDGETS }, (_, i) => ({ id: `w${i}`, type: 'dice' })),
        )
      ).statusCode,
    ).toBe(200);
  });

  it('is for the GM only', async () => {
    const { url, cookie, player, reader } = await setup();
    for (const other of [player.api, reader.api]) {
      expect((await other.get(url)).statusCode).toBe(403);
      expect((await other.put(url, { widgets: [] })).statusCode).toBe(403);
    }
    // A GM previewing as a player is in the player's view, so the screen is not available either.
    const preview = apiClient(app, cookie, { 'x-view-as': 'player' });
    expect((await preview.get(url)).statusCode).toBe(403);
    expect((await preview.put(url, { widgets: [] })).statusCode).toBe(403);
  });
});
