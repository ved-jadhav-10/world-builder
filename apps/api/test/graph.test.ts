import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Entity, FamilyData, GraphData, RelationshipType } from '@atlas/shared';
import { buildApp } from '../src/app';
import { apiClient, joinWorld, signUpWithWorld, type TestApp } from './helpers';

let app: TestApp;
beforeAll(async () => {
  app = await buildApp();
});
afterAll(() => app.close());

async function setup() {
  const ctx = await signUpWithWorld(app);
  const player = await joinWorld(app, ctx.world.id, 'player');
  const rels = (await ctx.api.get(`${ctx.w}/relationship-types`)).json<RelationshipType[]>();
  const rel = (key: string) => rels.find((r) => r.key === key)!;
  const person = async (name: string, extra: object = {}) =>
    (
      await ctx.api.post(`${ctx.w}/entities`, { typeId: ctx.typeId('character'), name, ...extra })
    ).json<Entity>();
  const link = async (a: Entity, key: string, b: Entity) => {
    const res = await ctx.api.post(`${ctx.w}/relationships`, {
      sourceId: a.id,
      targetId: b.id,
      typeId: rel(key).id,
    });
    expect(res.statusCode, res.body).toBe(201);
    return res.json<{ id: string }>();
  };
  const graph = async (query = '', api = ctx.api) => {
    const res = await api.get(`${ctx.w}/graph${query}`);
    expect(res.statusCode, res.body).toBe(200);
    return res.json<GraphData>();
  };
  const family = async (e: Entity, query = '', api = ctx.api) => {
    const res = await api.get(`${ctx.w}/family/${e.id}${query}`);
    expect(res.statusCode, res.body).toBe(200);
    return res.json<FamilyData>();
  };
  const names = (data: { nodes?: { name: string }[]; people?: { name: string }[] }) =>
    (data.nodes ?? data.people ?? []).map((n) => n.name).sort();
  return { ...ctx, player, person, link, graph, family, names, rel };
}

describe('relationship graph', () => {
  /** A - B - C - D - E in a line, plus F touching A. */
  async function chain() {
    const t = await setup();
    const [a, b, c, d, e, f] = await Promise.all(
      ['A', 'B', 'C', 'D', 'E', 'F'].map((n) => t.person(n)),
    );
    await t.link(a!, 'ally_of', b!);
    await t.link(b!, 'ally_of', c!);
    await t.link(c!, 'ally_of', d!);
    await t.link(d!, 'ally_of', e!);
    await t.link(f!, 'enemy_of', a!);
    return { ...t, a: a!, b: b!, c: c!, d: d!, e: e!, f: f! };
  }

  it('shows the neighbourhood of an entry to the depth asked for', async () => {
    const { graph, names, a } = await chain();
    expect(names(await graph(`?focus=${a.id}&depth=1`))).toEqual(['A', 'B', 'F']);
    expect(names(await graph(`?focus=${a.id}&depth=2`))).toEqual(['A', 'B', 'C', 'F']);
    expect(names(await graph(`?focus=${a.id}&depth=3`))).toEqual(['A', 'B', 'C', 'D', 'F']);
    // The default is two links out.
    expect(names(await graph(`?focus=${a.id}`))).toEqual(['A', 'B', 'C', 'F']);
  });

  it('returns the links among the entries shown, read from their source', async () => {
    const { graph, a, b, f } = await chain();
    const data = await graph(`?focus=${a.id}&depth=1`);
    expect(data.focusId).toBe(a.id);
    expect(data.edges).toHaveLength(2);
    const enemy = data.edges.find((e) => e.sourceId === f.id)!;
    expect(enemy).toMatchObject({ targetId: a.id, label: 'enemy of', inverseLabel: 'enemy of' });
    expect(data.edges.find((e) => e.targetId === b.id)).toMatchObject({ label: 'ally of' });
    // Degrees count only the links drawn.
    const degree = Object.fromEntries(data.nodes.map((n) => [n.name, n.degree]));
    expect(degree).toEqual({ A: 2, B: 1, F: 1 });
  });

  it('caps the number of entries and says so', async () => {
    const { graph, a, c } = await chain();
    // Three links out from C reaches all six; five is not enough.
    const data = await graph(`?focus=${c.id}&depth=3&limit=5`);
    expect(data.nodes).toHaveLength(5);
    expect(data.truncated).toBe(true);
    expect((await graph(`?focus=${c.id}&depth=3&limit=6`)).truncated).toBe(false);
    expect((await graph(`?focus=${a.id}&depth=1`)).truncated).toBe(false);
    // Every link returned is between entries that are shown.
    const shown = new Set(data.nodes.map((n) => n.id));
    expect(data.edges.every((e) => shown.has(e.sourceId) && shown.has(e.targetId))).toBe(true);
  });

  it('with no focus, shows the best-connected entries first', async () => {
    const { graph, person, link } = await setup();
    const hub = await person('Hub');
    for (const name of ['S1', 'S2', 'S3', 'S4', 'S5', 'S6']) {
      await link(hub, 'ally_of', await person(name));
    }
    const lonely = await person('Lonely');
    const pair = [await person('P1'), await person('P2')];
    await link(pair[0]!, 'ally_of', pair[1]!);
    const top = await graph('?limit=5');
    expect(top.focusId).toBeNull();
    expect(top.nodes[0]!.name).toBe('Hub');
    expect(top.nodes).toHaveLength(5);
    expect(top.truncated).toBe(true);
    const all = await graph();
    expect(all.nodes.map((n) => n.name)).not.toContain(lonely.name);
    expect(all.truncated).toBe(false);
  });

  it('is empty for a world with no links', async () => {
    const { graph, person } = await setup();
    await person('Alone');
    expect(await graph()).toEqual({ focusId: null, nodes: [], edges: [], truncated: false });
  });

  it('leaves out trashed entries and trashed links', async () => {
    const { api, w, graph, names, a, b, c } = await chain();
    await api.delete(`${w}/entities/${c.id}`);
    expect(names(await graph(`?focus=${a.id}&depth=3`))).toEqual(['A', 'B', 'F']);
    const links = (await api.get(`${w}/entities/${a.id}/relationships`)).json<{ id: string }[]>();
    expect(links.length).toBeGreaterThan(0);
    await api.delete(`${w}/relationships/${links[0]!.id}`);
    const after = await graph(`?focus=${a.id}&depth=1`);
    expect(after.edges.length).toBeLessThan(2);
    expect(b.name).toBe('B');
  });

  it('shows only links that hold on a given in-world day', async () => {
    const { api, w, graph, person, link } = await setup();
    const x = await person('X');
    const y = await person('Y');
    const z = await person('Z');
    const always = await link(x, 'ally_of', y);
    const war = await link(x, 'enemy_of', z);
    await api.patch(`${w}/relationships/${war.id}`, { validFromDay: 100, validToDay: 200 });
    const at = async (day: number) =>
      (await graph(`?focus=${x.id}&day=${day}`)).edges.map((e) => e.id).sort();
    expect(await at(50)).toEqual([always.id]);
    expect(await at(150)).toEqual([always.id, war.id].sort());
    expect(await at(250)).toEqual([always.id]);
    expect((await graph(`?focus=${x.id}`)).edges).toHaveLength(2);
  });

  it('never shows a player what is hidden from them, nor that it exists', async () => {
    const { api, w, graph, person, link, player, cookie } = await setup();
    const open = await person('Open', { visibility: 'player' });
    const friend = await person('Friend', { visibility: 'player' });
    const secret = await person('Secret');
    const bridge = await person('Bridge', { visibility: 'player' });
    await link(open, 'ally_of', friend);
    await link(open, 'enemy_of', secret);
    // The only way from Open to Beyond is through the hidden Secret.
    const beyond = await person('Beyond', { visibility: 'player' });
    await link(secret, 'ally_of', beyond);
    await link(open, 'ally_of', bridge);

    const asGm = await graph(`?focus=${open.id}&depth=3`);
    expect(asGm.nodes.map((n) => n.name).sort()).toEqual([
      'Beyond',
      'Bridge',
      'Friend',
      'Open',
      'Secret',
    ]);

    const asPlayer = await graph(`?focus=${open.id}&depth=3`, player.api);
    expect(asPlayer.nodes.map((n) => n.name).sort()).toEqual(['Bridge', 'Friend', 'Open']);
    expect(asPlayer.edges).toHaveLength(2);
    // Degrees do not give away hidden links either.
    expect(asPlayer.nodes.find((n) => n.name === 'Open')!.degree).toBe(2);

    // The hidden entry cannot even be a focus: it answers like a missing one.
    expect((await player.api.get(`${w}/graph?focus=${secret.id}`)).statusCode).toBe(404);

    // Previewing as a player is the same as being one.
    const preview = apiClient(app, cookie, { 'x-view-as': 'player' });
    expect((await graph(`?focus=${open.id}&depth=3`, preview)).nodes).toHaveLength(3);
    expect((await graph('', player.api)).nodes.map((n) => n.name)).not.toContain('Secret');
    expect(api).toBeDefined();
  });

  it('is private to its world and checks its input', async () => {
    const mine = await chain();
    const other = await signUpWithWorld(app, 'Elsewhere');
    expect((await other.api.get(`${mine.w}/graph`)).statusCode).toBe(404);
    expect((await other.api.get(`${other.w}/graph?focus=${mine.a.id}`)).statusCode).toBe(404);
    for (const bad of ['?focus=nope', '?depth=0', '?depth=4', '?limit=2', '?limit=301', '?day=x']) {
      expect((await mine.api.get(`${mine.w}/graph${bad}`)).statusCode, bad).toBe(400);
    }
  });
});

describe('family', () => {
  async function clan() {
    const t = await setup();
    const p = Object.fromEntries(
      await Promise.all(
        ['Gran', 'Grandad', 'Dad', 'Mum', 'Uncle', 'Kid', 'Sib', 'Grandkid', 'Friend'].map(
          async (n) => [n, await t.person(n)] as const,
        ),
      ),
    ) as Record<string, Entity>;
    await t.link(p.Gran!, 'parent_of', p.Dad!);
    await t.link(p.Grandad!, 'parent_of', p.Dad!);
    await t.link(p.Gran!, 'parent_of', p.Uncle!);
    await t.link(p.Dad!, 'parent_of', p.Kid!);
    await t.link(p.Mum!, 'parent_of', p.Kid!);
    await t.link(p.Dad!, 'parent_of', p.Sib!);
    await t.link(p.Kid!, 'parent_of', p.Grandkid!);
    await t.link(p.Gran!, 'spouse_of', p.Grandad!);
    await t.link(p.Dad!, 'spouse_of', p.Mum!);
    await t.link(p.Kid!, 'sibling_of', p.Sib!);
    await t.link(p.Kid!, 'ally_of', p.Friend!); // not a family link
    return { ...t, p };
  }

  it('finds ancestors, descendants, spouses and siblings, and nothing else', async () => {
    const { family, names, p } = await clan();
    const data = await family(p.Kid!);
    expect(data.focusId).toBe(p.Kid!.id);
    expect(names(data)).toEqual(['Dad', 'Gran', 'Grandad', 'Grandkid', 'Kid', 'Mum', 'Sib'].sort());
    // Dad's brother is not an ancestor or a descendant, so he is not here unless linked as a sibling.
    expect(data.parentOf).toHaveLength(6);
    expect(data.spouses).toHaveLength(2);
    expect(data.siblings).toHaveLength(1);
    expect(names(data)).not.toContain('Friend');
  });

  it('limits the generations walked up and down', async () => {
    const { family, names, p } = await clan();
    expect(names(await family(p.Kid!, '?up=1&down=0'))).toEqual(['Dad', 'Kid', 'Mum', 'Sib']);
    expect(names(await family(p.Kid!, '?up=0&down=1'))).toEqual(['Grandkid', 'Kid', 'Sib']);
    // Going up from Kid reaches Gran only on the second step; her spouse comes with her.
    expect(names(await family(p.Kid!, '?up=2&down=0'))).toEqual([
      'Dad',
      'Gran',
      'Grandad',
      'Kid',
      'Mum',
      'Sib',
    ]);
    const alone = await family(p.Kid!, '?up=0&down=0');
    expect(names(alone)).toEqual(['Kid', 'Sib']);
  });

  it('works from any person in the family', async () => {
    const { family, names, p } = await clan();
    expect(names(await family(p.Gran!, '?up=0&down=3'))).toEqual(
      ['Dad', 'Gran', 'Grandad', 'Grandkid', 'Kid', 'Mum', 'Sib', 'Uncle'].sort(),
    );
    expect(names(await family(p.Friend!))).toEqual(['Friend']);
  });

  it('hides family members the player cannot see', async () => {
    const { api, w, family, names, p, player } = await clan();
    await api.patch(`${w}/entities/${p.Kid!.id}`, { visibility: 'player' });
    await api.patch(`${w}/entities/${p.Dad!.id}`, { visibility: 'player' });
    await api.patch(`${w}/entities/${p.Grandkid!.id}`, { visibility: 'player' });
    expect(names(await family(p.Kid!, '', player.api))).toEqual(['Dad', 'Grandkid', 'Kid']);
    // A hidden person cannot be the centre of a player's tree.
    expect((await player.api.get(`${w}/family/${p.Mum!.id}`)).statusCode).toBe(404);
  });

  it('is private to its world and checks its input', async () => {
    const mine = await clan();
    const other = await signUpWithWorld(app, 'Elsewhere');
    expect((await other.api.get(`${mine.w}/family/${mine.p.Kid!.id}`)).statusCode).toBe(404);
    expect((await other.api.get(`${other.w}/family/${mine.p.Kid!.id}`)).statusCode).toBe(404);
    for (const bad of ['?up=6', '?down=-1', '?up=x']) {
      expect((await mine.api.get(`${mine.w}/family/${mine.p.Kid!.id}${bad}`)).statusCode, bad).toBe(
        400,
      );
    }
    expect((await mine.api.get(`${mine.w}/family/nope`)).statusCode).toBe(400);
  });
});
