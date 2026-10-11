import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Appearance, Entity, ManuscriptNode, Scene, WorldExport } from '@atlas/shared';
import { buildApp } from '../src/app';
import { signUp, signUpWithWorld, type TestApp } from './helpers';

let app: TestApp;
beforeAll(async () => {
  app = await buildApp();
});
afterAll(() => app.close());

const doc = (...paragraphs: string[]) => ({
  type: 'doc',
  content: paragraphs.map((text) => ({ type: 'paragraph', content: [{ type: 'text', text }] })),
});

async function setup() {
  const ctx = await signUpWithWorld(app);
  const { api, w } = ctx;
  const node = async (kind: string, title: string, parentId: string | null = null) => {
    const res = await api.post(`${w}/manuscript/nodes`, { kind, title, parentId });
    expect(res.statusCode, res.body).toBe(201);
    return res.json<ManuscriptNode>();
  };
  const entity = async (type: string, name: string, aliases: string[] = []) =>
    (await api.post(`${w}/entities`, { typeId: ctx.typeId(type), name, aliases })).json<Entity>();
  const tree = async () => (await api.get(`${w}/manuscript`)).json<ManuscriptNode[]>();
  return { ...ctx, node, entity, tree };
}

describe('manuscript tree', () => {
  it('builds book > part > chapter > scene and enforces placement', async () => {
    const { api, w, node } = await setup();
    const book = await node('book', 'The Salt Road');
    const part = await node('part', 'Part One', book.id);
    const chapter = await node('chapter', 'Arrival', part.id);
    await node('chapter', 'Directly in the book', book.id);
    const scene = await node('scene', 'At the docks', chapter.id);
    expect(scene).toMatchObject({ kind: 'scene', parentId: chapter.id, sortOrder: 0 });

    const bad = [
      { kind: 'scene', title: 'Orphan', parentId: null },
      { kind: 'chapter', title: 'In a scene', parentId: scene.id },
      { kind: 'book', title: 'Nested book', parentId: book.id },
    ];
    for (const payload of bad) {
      const res = await api.post(`${w}/manuscript/nodes`, payload);
      expect(res.statusCode, JSON.stringify(payload)).toBe(400);
    }
  });

  it('saves scene text, counts words and totals them up the tree', async () => {
    const { api, w, node, tree } = await setup();
    const book = await node('book', 'Book');
    const chapter = await node('chapter', 'One', book.id);
    const a = await node('scene', 'A', chapter.id);
    const b = await node('scene', 'B', chapter.id);

    const saved = await api.put(`${w}/manuscript/scenes/${a.id}/body`, {
      body: doc('The tide came in.', 'Nobody moved.'),
    });
    expect(saved.statusCode, saved.body).toBe(200);
    expect(saved.json<Scene>().wordCount).toBe(6);
    await api.put(`${w}/manuscript/scenes/${b.id}/body`, { body: doc('Four words right here.') });

    const nodes = await tree();
    expect(nodes.find((n) => n.id === chapter.id)?.wordCount).toBe(10);
    expect(nodes.find((n) => n.id === book.id)?.wordCount).toBe(10);
    expect((await api.get(`${w}/manuscript/scenes/${a.id}`)).json<Scene>().body).toEqual(
      doc('The tide came in.', 'Nobody moved.'),
    );
    // Only scenes have bodies.
    expect((await api.get(`${w}/manuscript/scenes/${chapter.id}`)).statusCode).toBe(404);
  });

  it('moves and reorders nodes, refusing invalid targets', async () => {
    const { api, w, node, tree } = await setup();
    const book = await node('book', 'Book');
    const one = await node('chapter', 'One', book.id);
    const two = await node('chapter', 'Two', book.id);
    const s1 = await node('scene', 's1', one.id);
    const s2 = await node('scene', 's2', one.id);
    const s3 = await node('scene', 's3', one.id);

    await api.post(`${w}/manuscript/nodes/${s3.id}/move`, { parentId: one.id, index: 0 });
    let nodes = await tree();
    const order = (parentId: string) =>
      nodes.filter((n) => n.parentId === parentId).map((n) => n.title);
    expect(order(one.id)).toEqual(['s3', 's1', 's2']);

    await api.post(`${w}/manuscript/nodes/${s1.id}/move`, { parentId: two.id, index: 99 });
    nodes = await tree();
    expect(order(one.id)).toEqual(['s3', 's2']);
    expect(order(two.id)).toEqual(['s1']);

    const invalid = await api.post(`${w}/manuscript/nodes/${s2.id}/move`, {
      parentId: book.id,
      index: 0,
    });
    expect(invalid.statusCode).toBe(400);

    expect((await api.delete(`${w}/manuscript/nodes/${one.id}`)).statusCode).toBe(204);
    nodes = await tree();
    expect(nodes.map((n) => n.title).sort()).toEqual(['Book', 'Two', 's1']);
  });

  it('stores scene metadata and only accepts live entities from the world', async () => {
    const { api, w, node, entity } = await setup();
    const book = await node('book', 'Book');
    const chapter = await node('chapter', 'One', book.id);
    const scene = await node('scene', 'Docks', chapter.id);
    const mira = await entity('character', 'Mira');

    const res = await api.patch(`${w}/manuscript/nodes/${scene.id}`, {
      povId: mira.id,
      inWorldDate: '3rd of Frostfall',
      summary: 'Mira meets the smuggler.',
    });
    expect(res.json<ManuscriptNode>()).toMatchObject({
      povId: mira.id,
      inWorldDate: '3rd of Frostfall',
    });

    const other = await signUpWithWorld(app);
    const foreign = (
      await other.api.post(`${other.w}/entities`, { typeId: other.typeId('character'), name: 'X' })
    ).json<Entity>();
    expect(
      (await api.patch(`${w}/manuscript/nodes/${scene.id}`, { povId: foreign.id })).statusCode,
    ).toBe(404);
    expect(
      (await api.patch(`${w}/manuscript/nodes/${chapter.id}`, { povId: mira.id })).statusCode,
    ).toBe(400);
  });
});

describe('mentions and appearances', () => {
  it('detects names and aliases and lists appearances in reading order', async () => {
    const { api, w, node, entity } = await setup();
    const mira = await entity('character', 'Mira Vey', ['The Barkeep']);
    const eel = await entity('location', 'The Gilded Eel');
    const book = await node('book', 'The Salt Road');
    const one = await node('chapter', 'One', book.id);
    const two = await node('chapter', 'Two', book.id);
    const s1 = await node('scene', 'Docks', one.id);
    const s2 = await node('scene', 'Tavern', two.id);
    const s3 = await node('scene', 'Quiet', two.id);

    await api.put(`${w}/manuscript/scenes/${s2.id}/body`, {
      body: doc('The barkeep wiped the bar at the Gilded Eel.', 'Mira Vey sighed.'),
    });
    await api.put(`${w}/manuscript/scenes/${s1.id}/body`, {
      body: doc('Mira Vey watched the ships.'),
    });
    await api.patch(`${w}/manuscript/nodes/${s3.id}`, { locationId: eel.id });

    const miraIn = (await api.get(`${w}/entities/${mira.id}/appearances`)).json<Appearance[]>();
    expect(miraIn).toEqual([
      expect.objectContaining({
        sceneTitle: 'Docks',
        chapterTitle: 'One',
        bookTitle: 'The Salt Road',
        mentions: 1,
      }),
      expect.objectContaining({ sceneTitle: 'Tavern', chapterTitle: 'Two', mentions: 2 }),
    ]);
    const eelIn = (await api.get(`${w}/entities/${eel.id}/appearances`)).json<Appearance[]>();
    expect(eelIn.map((a) => [a.sceneTitle, a.mentions, a.asLocation])).toEqual([
      ['Tavern', 1, false],
      ['Quiet', 0, true],
    ]);
  });

  it('rescans when names change, entities are created, or trashed and restored', async () => {
    const { api, w, node, entity } = await setup();
    const book = await node('book', 'Book');
    const chapter = await node('chapter', 'One', book.id);
    const scene = await node('scene', 'Scene', chapter.id);
    await api.put(`${w}/manuscript/scenes/${scene.id}/body`, {
      body: doc('Old Hask told Pip about the Drowned Compass.'),
    });

    // Created after the scene was written: still found.
    const compass = await entity('item', 'Drowned Compass');
    const appearances = async (id: string) =>
      (await api.get(`${w}/entities/${id}/appearances`)).json<Appearance[]>();
    expect(await appearances(compass.id)).toHaveLength(1);

    const hask = await entity('character', 'Haskell');
    expect(await appearances(hask.id)).toHaveLength(0);
    await api.patch(`${w}/entities/${hask.id}`, { aliases: ['Old Hask'] });
    expect(await appearances(hask.id)).toHaveLength(1);

    await api.delete(`${w}/entities/${compass.id}`);
    expect((await api.get(`${w}/entities/${compass.id}/appearances`)).statusCode).toBe(404);
    await api.post(`${w}/trash/${compass.id}/restore`);
    expect(await appearances(compass.id)).toHaveLength(1);

    const index = (await api.get(`${w}/mention-index`)).json<{ name: string }[]>();
    expect(index.map((e) => e.name).sort()).toEqual(['Drowned Compass', 'Haskell']);
  });
});

describe('manuscript access and export', () => {
  it("keeps one user's manuscript away from another", async () => {
    const { node } = await setup();
    const owner = await setup();
    const book = await owner.node('book', 'Secret book');
    const chapter = await owner.node('chapter', 'One', book.id);
    const scene = await owner.node('scene', 'Secret scene', chapter.id);
    await node('book', 'Unrelated');

    const intruder = await signUp(app);
    for (const url of [
      `${owner.w}/manuscript`,
      `${owner.w}/manuscript/scenes/${scene.id}`,
      `${owner.w}/mention-index`,
    ]) {
      expect((await intruder.api.get(url)).statusCode, url).toBe(404);
    }
    const write = await intruder.api.post(`${owner.w}/manuscript/nodes`, {
      kind: 'book',
      title: 'x',
    });
    expect(write.statusCode).toBe(404);
  });

  it('includes the manuscript with scene text in the export', async () => {
    const { api, w, node } = await setup();
    const book = await node('book', 'Book');
    const chapter = await node('chapter', 'One', book.id);
    const scene = await node('scene', 'Scene', chapter.id);
    await api.put(`${w}/manuscript/scenes/${scene.id}/body`, { body: doc('Hello there.') });

    const data = (await api.get(`${w}/export`)).json<WorldExport>();
    expect(data.manuscript.map((n) => n.title)).toEqual(['Book', 'One', 'Scene']);
    expect(data.manuscript.find((n) => n.id === scene.id)?.body).toEqual(doc('Hello there.'));
  });
});
