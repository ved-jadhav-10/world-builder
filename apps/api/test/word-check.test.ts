import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { ManuscriptNode, WordCheckResult } from '@atlas/shared';
import { buildApp } from '../src/app';
import { joinWorld, signUpWithWorld, type TestApp } from './helpers';

let app: TestApp;
beforeAll(async () => {
  app = await buildApp();
});
afterAll(() => app.close());

const doc = (text: string) => ({
  type: 'doc',
  content: [{ type: 'paragraph', content: [{ type: 'text', text }] }],
});

async function setup() {
  const ctx = await signUpWithWorld(app);
  const { api, w } = ctx;
  const node = async (kind: string, title: string, parentId?: string) =>
    (await api.post(`${w}/manuscript/nodes`, { kind, title, parentId })).json<ManuscriptNode>();
  const book = await node('book', 'Book One');
  const ch1 = await node('chapter', 'Chapter One', book.id);
  const ch2 = await node('chapter', 'Chapter Two', book.id);
  const write = async (parent: ManuscriptNode, title: string, text: string) => {
    const scene = await node('scene', title, parent.id);
    const res = await api.put(`${w}/manuscript/scenes/${scene.id}/body`, { body: doc(text) });
    expect(res.statusCode, res.body).toBe(200);
    return scene;
  };
  const check = async (query = '', client = api) => {
    const res = await client.get(`${w}/manuscript/word-check${query}`);
    expect(res.statusCode, res.body).toBe(200);
    return res.json<WordCheckResult>();
  };
  return { ...ctx, book, ch1, ch2, write, check };
}

describe('word check', () => {
  it('checks the whole manuscript, or one part of it', async () => {
    const { ch1, ch2, book, write, check } = await setup();
    await write(ch1, 'Opening', 'The lantern swung. The lantern glowed. The lantern died.');
    await write(ch2, 'Middle', 'A harbour. A harbour at dawn. A harbour again.');

    const all = await check();
    expect(all.scope).toMatchObject({ id: null, title: 'Whole manuscript', scenes: 2 });
    expect(all.check.totalWords).toBe(18);
    expect(all.check.topWords.map((w) => w.word).sort()).toEqual(['harbour', 'lantern']);

    const first = await check(`?nodeId=${ch1.id}`);
    expect(first.scope).toMatchObject({
      id: ch1.id,
      title: 'Chapter One',
      kind: 'chapter',
      scenes: 1,
    });
    expect(first.check.topWords.map((w) => w.word)).toEqual(['lantern']);

    const bookWide = await check(`?nodeId=${book.id}`);
    expect(bookWide.scope.scenes).toBe(2);
    expect(bookWide.check.totalWords).toBe(all.check.totalWords);
  });

  it('checks a single scene', async () => {
    const { ch1, write, check } = await setup();
    const scene = await write(ch1, 'Opening', 'She just really wanted it, quietly, quietly.');
    const result = await check(`?nodeId=${scene.id}`);
    expect(result.scope.kind).toBe('scene');
    expect(result.check.crutchWords.map((w) => w.word).sort()).toEqual(['just', 'really']);
    expect(result.check.adverbs.total).toBe(2);
  });

  it('leaves the names of entries out of the word lists, aliases included', async () => {
    const { api, w, typeId, ch1, write, check } = await setup();
    await api.post(`${w}/entities`, {
      typeId: typeId('character'),
      name: 'Mira Vael',
      aliases: ['Swift'],
    });
    await write(ch1, 'Opening', 'Mira ran. Mira hid. Mira wept. Swift ran. Swift hid. Swift fell.');
    const result = await check();
    expect(result.check.topWords).toEqual([]);
    expect(result.check.totalWords).toBe(12);
  });

  it('counts watched words, and reads the order they were asked in', async () => {
    const { ch1, write, check } = await setup();
    await write(ch1, 'Opening', 'The sun rose over the sun-lit sea.');
    const result = await check('?watch=sun,%20moon');
    expect(result.check.watched.map((w) => [w.word, w.count])).toEqual([
      ['sun', 2],
      ['moon', 0],
    ]);
  });

  it('works on an empty manuscript, and refuses a missing node', async () => {
    const { api, w, check } = await setup();
    const empty = await check();
    expect(empty.scope.scenes).toBe(0);
    expect(empty.check.totalWords).toBe(0);
    const bogus = await api.get(
      `${w}/manuscript/word-check?nodeId=00000000-0000-4000-8000-000000000000`,
    );
    expect(bogus.statusCode).toBe(404);
    expect((await api.get(`${w}/manuscript/word-check?nodeId=nope`)).statusCode).toBe(400);
  });

  it('keeps to its own world', async () => {
    const { ch1, write, check, w } = await setup();
    await write(ch1, 'Mine', 'secret secret secret');
    const other = await setup();
    expect((await other.api.get(`${w}/manuscript/word-check`)).statusCode).toBe(404);
    expect((await check()).check.topWords.map((x) => x.word)).toEqual(['secret']);
    const foreign = await other.api.get(`${other.w}/manuscript/word-check?nodeId=${ch1.id}`);
    expect(foreign.statusCode).toBe(404);
  });

  it('is for the GM side only', async () => {
    const { world, w, ch1, write } = await setup();
    await write(ch1, 'Opening', 'text');
    for (const role of ['player', 'reader', 'commenter'] as const) {
      const member = await joinWorld(app, world.id, role);
      expect((await member.api.get(`${w}/manuscript/word-check`)).statusCode, role).toBe(403);
    }
    const editor = await joinWorld(app, world.id, 'editor');
    expect((await editor.api.get(`${w}/manuscript/word-check`)).statusCode).toBe(200);
  });
});
