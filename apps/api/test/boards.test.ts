import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import sharp from 'sharp';
import type {
  Board,
  BoardDocInput,
  BoardSummary,
  Entity,
  GalleryImage,
  WorldExport,
} from '@atlas/shared';
import { buildApp } from '../src/app';
import { apiClient, joinWorld, multipartForm, signUpWithWorld, type TestApp } from './helpers';

let app: TestApp;
beforeAll(async () => {
  app = await buildApp();
});
afterAll(() => app.close());

const box = { x: 0, y: 0, w: 200, h: 120 };

async function setup() {
  const ctx = await signUpWithWorld(app);
  const { api, w } = ctx;
  const make = async (name: string, kind?: 'canvas' | 'mood') => {
    const res = await api.post(`${w}/boards`, { name, ...(kind ? { kind } : {}) });
    expect(res.statusCode, res.body).toBe(201);
    return res.json<Board>();
  };
  const save = async (board: Board, doc: BoardDocInput) => {
    const res = await api.patch(`${w}/boards/${board.id}`, { doc, baseVersion: board.version });
    expect(res.statusCode, res.body).toBe(200);
    return res.json<Board>();
  };
  const entry = async (name: string, visibility = 'gm') =>
    (
      await api.post(`${w}/entities`, { typeId: ctx.typeId('character'), name, visibility })
    ).json<Entity>();
  const picture = async (fields: Record<string, string> = {}) => {
    const data = await sharp({
      create: { width: 60, height: 40, channels: 3, background: '#335577' },
    })
      .png()
      .toBuffer();
    const form = multipartForm(fields, { name: 'p.png', type: 'image/png', data });
    const res = await app.inject({
      method: 'POST',
      url: `/api${w}/images`,
      headers: { cookie: ctx.cookie, ...form.headers },
      payload: form.payload,
    });
    expect(res.statusCode, res.body).toBe(201);
    return res.json<GalleryImage>();
  };
  return { ...ctx, make, save, entry, picture };
}

describe('boards', () => {
  it('creates, lists, renames and deletes boards', async () => {
    const { api, w, make } = await setup();
    const canvas = await make('  Conspiracy  ');
    expect(canvas).toMatchObject({
      name: 'Conspiracy',
      kind: 'canvas',
      shared: false,
      version: 0,
      doc: { items: [], links: [] },
    });
    const mood = await make('Harbour at dusk', 'mood');
    expect(mood.kind).toBe('mood');

    const renamed = await api.patch(`${w}/boards/${canvas.id}`, { name: 'The conspiracy' });
    expect(renamed.json<Board>()).toMatchObject({ name: 'The conspiracy', version: 0 });

    const list = (await api.get(`${w}/boards`)).json<BoardSummary[]>();
    // The board changed last comes first.
    expect(list.map((b) => b.name)).toEqual(['The conspiracy', 'Harbour at dusk']);

    expect((await api.delete(`${w}/boards/${mood.id}`)).statusCode).toBe(204);
    expect((await api.get(`${w}/boards/${mood.id}`)).statusCode).toBe(404);
    expect((await api.post(`${w}/boards`, { name: ' ' })).statusCode).toBe(400);
  });

  it('saves the arrangement and gives each card its entry and picture', async () => {
    const { w, api, make, save, entry, picture } = await setup();
    const mira = await entry('Mira Vale');
    const portrait = await picture({ entityId: mira.id, portrait: 'true' });
    const view = await picture({ caption: 'The quay' });
    const board = await make('Cast');

    const saved = await save(board, {
      items: [
        { ...box, id: 'a', type: 'entry', entityId: mira.id },
        { ...box, id: 'b', type: 'image', imageId: view.id },
        { ...box, id: 'c', type: 'note', text: 'Who paid her?' },
        { ...box, id: 'd', type: 'swatch', color: '#335577' },
        { ...box, id: 'e', type: 'embed', url: 'https://youtu.be/dQw4w9WgXcQ' },
        { ...box, id: 'f', type: 'frame', title: 'Act one', w: 900, h: 600 },
      ],
      links: [{ id: 'l', from: 'a', to: 'c', label: 'hides' }],
    });
    expect(saved.version).toBe(1);
    expect(saved.doc.items).toHaveLength(6);
    expect(saved.entries[mira.id]).toMatchObject({ name: 'Mira Vale', portraitId: portrait.id });
    expect(saved.images[view.id]).toMatchObject({ width: 60, height: 40, caption: 'The quay' });

    const [summary] = (await api.get(`${w}/boards`)).json<BoardSummary[]>();
    expect(summary).toMatchObject({ itemCount: 6, previewImageIds: [view.id] });

    // A trashed entry leaves its card behind, without the entry.
    await api.delete(`${w}/entities/${mira.id}`);
    const after = (await api.get(`${w}/boards/${board.id}`)).json<Board>();
    expect(after.entries).toEqual({});
    expect(after.doc.items).toHaveLength(6);
  });

  it('refuses a save made on an old version, and a broken document', async () => {
    const { api, w, make, save } = await setup();
    const board = await make('Two editors');
    const first = await save(board, { items: [{ ...box, id: 'a', type: 'note', text: 'one' }] });
    expect(first.version).toBe(1);

    const stale = await api.patch(`${w}/boards/${board.id}`, {
      doc: { items: [] },
      baseVersion: 0,
    });
    expect(stale.statusCode).toBe(409);
    expect((await api.get(`${w}/boards/${board.id}`)).json<Board>().doc.items).toHaveLength(1);

    const noVersion = await api.patch(`${w}/boards/${board.id}`, { doc: { items: [] } });
    expect(noVersion.statusCode).toBe(400);
    const dangling = await api.patch(`${w}/boards/${board.id}`, {
      doc: { items: [], links: [{ id: 'l', from: 'x', to: 'y' }] },
      baseVersion: 1,
    });
    expect(dangling.statusCode).toBe(400);
  });

  it('shows players only shared boards, without what is hidden from them', async () => {
    const { api, w, world, cookie, make, save, entry, picture } = await setup();
    const player = await joinWorld(app, world.id, 'player');
    const reader = await joinWorld(app, world.id, 'reader');

    const known = await entry('Captain Orlo', 'player');
    const secret = await entry('The Pale Hand', 'gm');
    const open = await picture({ visibility: 'player' });
    const hidden = await picture({ visibility: 'gm' });

    const board = await save(await make('What the party knows'), {
      items: [
        { ...box, id: 'known', type: 'entry', entityId: known.id },
        { ...box, id: 'secret', type: 'entry', entityId: secret.id },
        { ...box, id: 'open', type: 'image', imageId: open.id },
        { ...box, id: 'hidden', type: 'image', imageId: hidden.id },
        { ...box, id: 'note', type: 'note', text: 'Seen at the docks' },
        { ...box, id: 'truth', type: 'note', text: 'Orlo is the Pale Hand', gmOnly: true },
      ],
      links: [
        { id: 'l1', from: 'known', to: 'note' },
        { id: 'l2', from: 'known', to: 'secret', label: 'is' },
        { id: 'l3', from: 'truth', to: 'known' },
      ],
    });
    await make('GM scratch');

    // Not shared yet: players see nothing.
    expect((await player.api.get(`${w}/boards`)).json()).toEqual([]);
    expect((await player.api.get(`${w}/boards/${board.id}`)).statusCode).toBe(404);

    await api.patch(`${w}/boards/${board.id}`, { shared: true });
    const list = (await player.api.get(`${w}/boards`)).json<BoardSummary[]>();
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({ itemCount: 3, previewImageIds: [open.id] });

    const seen = (await player.api.get(`${w}/boards/${board.id}`)).json<Board>();
    expect(seen.doc.items.map((item) => item.id)).toEqual(['known', 'open', 'note']);
    expect(seen.doc.links.map((link) => link.id)).toEqual(['l1']);
    expect(Object.keys(seen.entries)).toEqual([known.id]);
    expect(Object.keys(seen.images)).toEqual([open.id]);
    expect(JSON.stringify(seen)).not.toContain('Pale Hand');

    // A GM previewing as a player gets the same.
    const preview = apiClient(app, cookie, { 'x-view-as': 'player' });
    const previewed = (await preview.get(`${w}/boards/${board.id}`)).json<Board>();
    expect(previewed.doc.items.map((item) => item.id)).toEqual(['known', 'open', 'note']);

    // Readers have no boards, and nobody but a GM can change one.
    expect((await reader.api.get(`${w}/boards`)).json()).toEqual([]);
    expect((await reader.api.get(`${w}/boards/${board.id}`)).statusCode).toBe(404);
    expect((await player.api.post(`${w}/boards`, { name: 'Mine' })).statusCode).toBe(403);
    expect((await player.api.patch(`${w}/boards/${board.id}`, { name: 'x' })).statusCode).toBe(403);
    expect((await player.api.delete(`${w}/boards/${board.id}`)).statusCode).toBe(403);
    expect((await preview.patch(`${w}/boards/${board.id}`, { name: 'x' })).statusCode).toBe(403);
  });

  it('keeps boards inside their world', async () => {
    const one = await setup();
    const two = await setup();
    const board = await one.make('Private');
    const foreign = await one.entry('Elsewhere');
    expect((await two.api.get(`${two.w}/boards/${board.id}`)).statusCode).toBe(404);
    expect((await two.api.get(`${one.w}/boards/${board.id}`)).statusCode).toBe(404);

    // A card naming another world's entry shows nothing of it.
    const mine = await two.save(await two.make('Mine'), {
      items: [{ ...box, id: 'a', type: 'entry', entityId: foreign.id }],
    });
    expect(mine.entries).toEqual({});
  });

  it('puts boards in the world export, and a player export holds only theirs', async () => {
    const { api, w, make, save, entry } = await setup();
    const secret = await entry('The Pale Hand', 'gm');
    const shared = await save(await make('Shared'), {
      items: [
        { ...box, id: 'a', type: 'entry', entityId: secret.id },
        { ...box, id: 'b', type: 'note', text: 'Rumour' },
      ],
    });
    await api.patch(`${w}/boards/${shared.id}`, { shared: true });
    await make('Private');

    const full = (await api.get(`${w}/export`)).json<WorldExport>();
    expect(full.boards.map((b) => b.name)).toEqual(['Shared', 'Private']);
    expect(full.boards[0]!.doc.items).toHaveLength(2);

    const forPlayers = (await api.get(`${w}/export?audience=player`)).json<WorldExport>();
    expect(forPlayers.boards).toHaveLength(1);
    expect(forPlayers.boards[0]!.doc.items.map((item) => item.id)).toEqual(['b']);
    const forReaders = (await api.get(`${w}/export?audience=reader`)).json<WorldExport>();
    expect(forReaders.boards).toEqual([]);
  });
});
