import { existsSync } from 'node:fs';
import sharp from 'sharp';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Handout, WorldExport } from '@atlas/shared';
import { buildApp } from '../src/app';
import { fullPath } from '../src/modules/gallery/files';
import { apiClient, joinWorld, multipartForm, signUpWithWorld, type TestApp } from './helpers';

let app: TestApp;
beforeAll(async () => {
  app = await buildApp();
});
afterAll(() => app.close());

const png = (width = 60, height = 40) =>
  sharp({ create: { width, height, channels: 3, background: '#7a3a3a' } })
    .png()
    .toBuffer();

async function setup() {
  const ctx = await signUpWithWorld(app);
  const { api, w, cookie } = ctx;
  const player = await joinWorld(app, ctx.world.id, 'player');
  const reader = await joinWorld(app, ctx.world.id, 'reader');
  const coGm = await joinWorld(app, ctx.world.id, 'editor');
  const make = async (title: string, extra: object = {}) => {
    const res = await api.post(`${w}/handouts`, { title, ...extra });
    expect(res.statusCode, res.body).toBe(201);
    return res.json<Handout>();
  };
  const uploadImage = async (id: string, data: Buffer, as = cookie) => {
    const form = multipartForm({}, { name: 'h.png', type: 'image/png', data });
    return app.inject({
      method: 'POST',
      url: `/api${w}/handouts/${id}/image`,
      headers: { cookie: as, ...form.headers },
      payload: form.payload,
    });
  };
  const list = async (client = api) => {
    const res = await client.get(`${w}/handouts`);
    expect(res.statusCode, res.body).toBe(200);
    return res.json<Handout[]>();
  };
  return { ...ctx, player, reader, coGm, make, uploadImage, list };
}

describe('handouts', () => {
  it('start hidden, and are the GM’s until revealed', async () => {
    const { make, list, player } = await setup();
    const h = await make('The old letter', { body: 'Dear Mira…' });
    expect(h).toMatchObject({
      title: 'The old letter',
      body: 'Dear Mira…',
      visibility: 'gm',
      revealedAt: null,
      hasImage: false,
    });
    expect((await list()).map((x) => x.id)).toEqual([h.id]);
    expect(await list(player.api)).toEqual([]);
  });

  it('are shown to players when revealed and hidden again with nothing left behind', async () => {
    const { make, list, player, reader, api, w } = await setup();
    const h = await make('Riddle', { body: 'What walks…' });
    const revealed = await api.patch(`${w}/handouts/${h.id}`, { visibility: 'player' });
    expect(revealed.statusCode, revealed.body).toBe(200);
    expect(revealed.json<Handout>().revealedAt).toBeTruthy();
    const seen = await list(player.api);
    expect(seen.map((x) => x.title)).toEqual(['Riddle']);
    expect(seen[0]!.body).toBe('What walks…');
    // A reader is a different audience and sees nothing shared with players.
    expect(await list(reader.api)).toEqual([]);

    await api.patch(`${w}/handouts/${h.id}`, { visibility: 'gm' });
    expect(await list(player.api)).toEqual([]);
    expect((await player.api.get(`${w}/handouts/${h.id}`)).statusCode).toBe(404);
    expect((await api.get(`${w}/handouts/${h.id}`)).json<Handout>().revealedAt).toBeNull();
  });

  it('count a second reveal as new, so players are told again', async () => {
    const { make, api, w } = await setup();
    const h = await make('Rumour', { visibility: 'player' });
    const first = h.revealedAt!;
    // Saving other changes keeps the original moment.
    const edited = await api.patch(`${w}/handouts/${h.id}`, { body: 'more' });
    expect(edited.json<Handout>().revealedAt).toBe(first);
    await api.patch(`${w}/handouts/${h.id}`, { visibility: 'gm' });
    await new Promise((r) => setTimeout(r, 15));
    const again = await api.patch(`${w}/handouts/${h.id}`, { visibility: 'player' });
    expect(new Date(again.json<Handout>().revealedAt!).getTime()).toBeGreaterThan(
      new Date(first).getTime(),
    );
  });

  it('lists the most recently revealed first', async () => {
    const { make, api, w, list, player } = await setup();
    const a = await make('A', { visibility: 'player' });
    await new Promise((r) => setTimeout(r, 15));
    const b = await make('B', { visibility: 'player' });
    expect((await list(player.api)).map((h) => h.title)).toEqual(['B', 'A']);
    await new Promise((r) => setTimeout(r, 15));
    await api.patch(`${w}/handouts/${a.id}`, { visibility: 'gm' });
    await api.patch(`${w}/handouts/${a.id}`, { visibility: 'player' });
    expect((await list(player.api)).map((h) => h.title)).toEqual(['A', 'B']);
    expect(b.id).toBeTruthy();
  });

  it('carry a picture that only audiences who can see the handout can fetch', async () => {
    const { make, uploadImage, api, w, player, reader } = await setup();
    const h = await make('Map scrap');
    const up = await uploadImage(h.id, await png(80, 50));
    expect(up.statusCode, up.body).toBe(200);
    const withImage = up.json<Handout>();
    expect(withImage).toMatchObject({ hasImage: true, imageWidth: 80, imageHeight: 50 });
    expect(withImage.imageVersion).toBe(1);

    // Hidden: only the GM has it.
    expect((await api.get(`${w}/handouts/${h.id}/image`)).statusCode).toBe(200);
    expect((await api.get(`${w}/handouts/${h.id}/thumbnail`)).statusCode).toBe(200);
    expect((await player.api.get(`${w}/handouts/${h.id}/image`)).statusCode).toBe(404);

    await api.patch(`${w}/handouts/${h.id}`, { visibility: 'player' });
    const file = await player.api.get(`${w}/handouts/${h.id}/image`);
    expect(file.statusCode).toBe(200);
    expect(file.headers['content-type']).toBe('image/webp');
    expect((await reader.api.get(`${w}/handouts/${h.id}/image`)).statusCode).toBe(404);

    // Replacing the picture bumps its version; removing it empties the handout again.
    const again = (await uploadImage(h.id, await png(30, 30))).json<Handout>();
    expect(again).toMatchObject({ imageWidth: 30, imageVersion: 2 });
    const removed = await api.delete(`${w}/handouts/${h.id}/image`);
    expect(removed.json<Handout>()).toMatchObject({ hasImage: false, imageVersion: 3 });
    expect((await player.api.get(`${w}/handouts/${h.id}/image`)).statusCode).toBe(404);
  });

  it('refuse a file that is not a picture, and leave the handout as it was', async () => {
    const { make, uploadImage, api, w } = await setup();
    const h = await make('Scrap');
    const res = await uploadImage(h.id, Buffer.from('not a picture'));
    expect(res.statusCode).toBe(400);
    expect((await api.get(`${w}/handouts/${h.id}`)).json<Handout>().hasImage).toBe(false);
  });

  it('delete with their picture', async () => {
    const { make, uploadImage, api, w, world } = await setup();
    const h = await make('Scrap');
    await uploadImage(h.id, await png());
    expect(existsSync(fullPath(world.id, h.id))).toBe(true);
    expect((await api.delete(`${w}/handouts/${h.id}`)).statusCode).toBe(204);
    expect(existsSync(fullPath(world.id, h.id))).toBe(false);
    expect((await api.get(`${w}/handouts/${h.id}`)).statusCode).toBe(404);
    expect((await api.delete(`${w}/handouts/${h.id}`)).statusCode).toBe(404);
  });

  it('check titles and lengths', async () => {
    const { api, w } = await setup();
    for (const body of [
      { title: '' },
      { title: '   ' },
      { title: 'x'.repeat(121) },
      { title: 'ok', body: 'x'.repeat(10_001) },
    ]) {
      expect(
        (await api.post(`${w}/handouts`, body)).statusCode,
        JSON.stringify(body).slice(0, 40),
      ).toBe(400);
    }
  });

  it('can only be changed by editors, and not while previewing', async () => {
    const { make, player, coGm, cookie, w } = await setup();
    const h = await make('Scrap', { visibility: 'player' });
    expect((await player.api.post(`${w}/handouts`, { title: 'x' })).statusCode).toBe(403);
    expect((await player.api.patch(`${w}/handouts/${h.id}`, { title: 'y' })).statusCode).toBe(403);
    expect((await player.api.delete(`${w}/handouts/${h.id}`)).statusCode).toBe(403);
    const preview = apiClient(app, cookie, { 'x-view-as': 'player' });
    expect((await preview.patch(`${w}/handouts/${h.id}`, { title: 'y' })).statusCode).toBe(403);
    // A preview as a player lists what a player would see, including the revealed one.
    expect((await preview.get(`${w}/handouts`)).json<Handout[]>().map((x) => x.id)).toEqual([h.id]);
    expect((await coGm.api.patch(`${w}/handouts/${h.id}`, { title: 'By co-GM' })).statusCode).toBe(
      200,
    );
  });

  it('stay inside their world and go into the export', async () => {
    const mine = await setup();
    const h = await mine.make('Secret', { body: 'for my table' });
    const other = await signUpWithWorld(app, 'Elsewhere');
    expect((await other.api.get(`${mine.w}/handouts/${h.id}`)).statusCode).toBe(404);
    expect((await other.api.get(`${other.w}/handouts/${h.id}`)).statusCode).toBe(404);
    expect(
      (await other.api.patch(`${other.w}/handouts/${h.id}`, { title: 'stolen' })).statusCode,
    ).toBe(404);
    expect(await mine.list(other.api).catch(() => null)).toBeNull();
    const data = (await mine.api.get(`${mine.w}/export`)).json<WorldExport>();
    expect(data.handouts.map((x) => x.title)).toEqual(['Secret']);
  });
});
