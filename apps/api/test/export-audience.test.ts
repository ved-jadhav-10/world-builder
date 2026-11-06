import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Entity, RelationshipType, Tag, WorldExport } from '@atlas/shared';
import { buildApp } from '../src/app';
import { joinWorld, signUpWithWorld, type ApiClient, type TestApp } from './helpers';

let app: TestApp;
beforeAll(async () => {
  app = await buildApp();
});
afterAll(() => app.close());

const p = (text: string) => ({ type: 'paragraph', content: [{ type: 'text', text }] });

async function build() {
  const ctx = await signUpWithWorld(app);
  const { api, w } = ctx;
  const entity = async (name: string, visibility: string, extra: object = {}) =>
    (
      await api.post(`${w}/entities`, {
        typeId: ctx.typeId('character'),
        name,
        visibility,
        ...extra,
      })
    ).json<Entity>();
  const open = await entity('Open Hero', 'public', {
    body: {
      type: 'doc',
      content: [p('Known to all.'), { type: 'secretBlock', content: [p('Secretly a spy.')] }],
    },
  });
  const forPlayers = await entity('Player Hero', 'player');
  const forReaders = await entity('Reader Hero', 'reader');
  const secret = await entity('GM Villain', 'gm');

  const rels = (await api.get(`${w}/relationship-types`)).json<RelationshipType[]>();
  const ally = rels.find((t) => t.key === 'ally_of')!.id;
  await api.post(`${w}/relationships`, {
    sourceId: open.id,
    targetId: forPlayers.id,
    typeId: ally,
  });
  await api.post(`${w}/relationships`, { sourceId: open.id, targetId: secret.id, typeId: ally });

  const tag = async (name: string, id: string) => {
    const created = (await api.post(`${w}/tags`, { name, color: '#445566' })).json<Tag>();
    await api.put(`${w}/entities/${id}/tags/${created.id}`);
  };
  await tag('Seen', open.id);
  await tag('Villainous', secret.id);

  const scene = (
    await api.post(`${w}/manuscript/nodes`, { kind: 'book', title: 'Book One' })
  ).json<{
    id: string;
  }>();
  expect(scene.id).toBeTruthy();
  await api.post(`${w}/handouts`, { title: 'Open Letter', visibility: 'player' });
  await api.post(`${w}/handouts`, { title: 'Hidden Note', visibility: 'gm' });
  return { ctx, open, forPlayers, forReaders, secret };
}

const exportFor = async (
  api: { get: (url: string) => Promise<{ statusCode: number; json: <T>() => T }> },
  w: string,
  audience?: string,
) => {
  const res = await api.get(`${w}/export${audience ? `?audience=${audience}` : ''}`);
  expect(res.statusCode).toBe(200);
  return res.json<WorldExport>();
};

describe('exporting for an audience', () => {
  it('gives the GM everything by default', async () => {
    const { ctx } = await build();
    const full = await exportFor(ctx.api, ctx.w);
    expect(full.entities.map((e) => e.name).sort()).toEqual([
      'GM Villain',
      'Open Hero',
      'Player Hero',
      'Reader Hero',
    ]);
    expect(full.manuscript.length).toBeGreaterThan(0);
    expect(JSON.stringify(full.entities)).toContain('Secretly a spy');
  });

  it('keeps only what players can see, and strips secrets, links and the workspace', async () => {
    const { ctx, open } = await build();
    const data = await exportFor(ctx.api, ctx.w, 'player');
    expect(data.entities.map((e) => e.name).sort()).toEqual(['Open Hero', 'Player Hero']);
    const hero = data.entities.find((e) => e.id === open.id)!;
    expect(JSON.stringify(hero.body)).toContain('Known to all');
    expect(JSON.stringify(data)).not.toContain('Secretly a spy');
    expect(JSON.stringify(data)).not.toContain('GM Villain');
    expect(data.relationships).toHaveLength(1);
    expect(data.tags.map((t) => t.name)).toEqual(['Seen']);
    expect(data.manuscript).toEqual([]);
    expect(data.handouts.map((h) => h.title)).toEqual(['Open Letter']);
  });

  it('gives readers and the public their own slices', async () => {
    const { ctx } = await build();
    const reader = await exportFor(ctx.api, ctx.w, 'reader');
    expect(reader.entities.map((e) => e.name).sort()).toEqual(['Open Hero', 'Reader Hero']);
    const everyone = await exportFor(ctx.api, ctx.w, 'public');
    expect(everyone.entities.map((e) => e.name)).toEqual(['Open Hero']);
    expect(everyone.relationships).toEqual([]);
    expect(everyone.handouts).toEqual([]);
  });

  it('builds the Markdown zip for an audience too, and stays editor-only', async () => {
    const { ctx } = await build();
    const res = await ctx.api.get(`${ctx.w}/export/markdown?audience=player`);
    expect(res.statusCode).toBe(200);
    expect(res.headers['content-disposition']).toContain('-markdown-player-');

    const player = await joinWorld(app, ctx.world.id, 'player');
    expect((await player.api.get(`${ctx.w}/export?audience=player`)).statusCode).toBe(403);
    expect((await ctx.api.get(`${ctx.w}/export?audience=gm`)).statusCode).toBe(400);
  });
});
