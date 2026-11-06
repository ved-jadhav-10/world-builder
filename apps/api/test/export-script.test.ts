import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Entity, ManuscriptNode, RichTextDoc } from '@atlas/shared';
import { buildApp } from '../src/app';
import { joinWorld, signUpWithWorld, type TestApp } from './helpers';

let app: TestApp;
beforeAll(async () => {
  app = await buildApp();
});
afterAll(() => app.close());

const para = (t: string) => ({ type: 'paragraph', content: [{ type: 'text', text: t }] });
const doc = (...content: unknown[]): RichTextDoc => ({ type: 'doc', content });

async function setup() {
  const ctx = await signUpWithWorld(app);
  const { api, w } = ctx;
  const player = await joinWorld(app, ctx.world.id, 'player');
  const entry = async (type: string, name: string) =>
    (await api.post(`${w}/entities`, { typeId: ctx.typeId(type), name })).json<Entity>();
  const node = async (kind: string, title: string, parentId?: string) =>
    (await api.post(`${w}/manuscript/nodes`, { kind, title, parentId })).json<ManuscriptNode>();
  return { ...ctx, player, entry, node };
}

describe('manuscript as a script', () => {
  it('makes a Fountain screenplay outline with places, dates, viewpoints and dialogue', async () => {
    const { api, w, entry, node } = await setup();
    const harbour = await entry('location', 'Vael Harbour');
    const mira = await entry('character', 'Mira');
    const book = await node('book', 'The Salt Road');
    const chapter = await node('chapter', 'The Docks', book.id);
    const scene = await node('scene', 'Arrival', chapter.id);
    await api.patch(`${w}/manuscript/nodes/${scene.id}`, {
      locationId: harbour.id,
      povId: mira.id,
      inWorldDate: 'dawn',
      summary: 'Mira lands.',
    });
    await api.put(`${w}/manuscript/scenes/${scene.id}/body`, {
      body: doc(para('Mira reached the docks.'), para('“You are late.”')),
    });

    const res = await api.get(`${w}/export/manuscript-script?author=Mira%20Vey`);
    expect(res.statusCode, res.body).toBe(200);
    expect(res.headers['content-type']).toContain('text/plain');
    expect(String(res.headers['content-disposition'])).toContain('The%20Salt%20Road.fountain');
    expect(res.body).toContain('Title: The Salt Road');
    expect(res.body).toContain('Author: Mira Vey');
    expect(res.body).toContain('INT./EXT. VAEL HARBOUR - DAWN');
    expect(res.body).toContain("[[Told from Mira's point of view]]");
    expect(res.body).toContain('@SPEAKER\nYou are late.');
  });

  it('makes a comic script, and keeps the manuscript to editors', async () => {
    const { api, w, node, player } = await setup();
    const book = await node('book', 'Strip');
    const chapter = await node('chapter', 'One', book.id);
    const scene = await node('scene', 'Opening', chapter.id);
    await api.put(`${w}/manuscript/scenes/${scene.id}/body`, {
      body: doc(para('A ship in the fog.')),
    });
    const res = await api.get(`${w}/export/manuscript-script?kind=comic`);
    expect(res.statusCode, res.body).toBe(200);
    expect(String(res.headers['content-disposition'])).toContain('Strip-comic-script.txt');
    expect(res.body).toContain('PAGE ONE');
    expect(res.body).toContain('Panel 1\nA ship in the fog.');
    expect((await player.api.get(`${w}/export/manuscript-script`)).statusCode).toBe(403);
  });

  it('refuses a manuscript with nothing written', async () => {
    const { api, w, node } = await setup();
    expect((await api.get(`${w}/export/manuscript-script`)).statusCode).toBe(400);
    await node('book', 'Empty');
    expect((await api.get(`${w}/export/manuscript-script`)).statusCode).toBe(400);
  });
});
