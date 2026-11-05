import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  MAX_PLOT_BOARDS,
  PLOT_TEMPLATES,
  PLOT_TEMPLATE_KEYS,
  type ManuscriptNode,
  type PlotBoard,
  type PlotBoardSummary,
} from '@atlas/shared';
import { buildApp } from '../src/app';
import { db } from '../src/db/client';
import { plotCards } from '../src/db/schema';
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
  const { api, w } = ctx;
  const board = async (name = 'Novel', template = 'blank') => {
    const res = await api.post(`${w}/plot`, { name, template });
    expect(res.statusCode, res.body).toBe(201);
    return res.json<PlotBoard>();
  };
  /** Runs a call that answers with the board, and returns it. */
  const ok = async (res: { statusCode: number; body: string; json: <T>() => T }) => {
    expect(res.statusCode, res.body).toBeLessThan(300);
    return res.json<PlotBoard>();
  };
  const card = async (b: PlotBoard, title: string, cell = { beat: 0, thread: 0 }) =>
    ok(
      await api.post(`${w}/plot/${b.id}/cards`, {
        beatId: b.beats[cell.beat]!.id,
        threadId: b.threads[cell.thread]!.id,
        title,
      }),
    );
  /** The titles in a cell, in order. */
  const cell = (b: PlotBoard, beat: number, thread: number) =>
    b.cards
      .filter((c) => c.beatId === b.beats[beat]!.id && c.threadId === b.threads[thread]!.id)
      .map((c) => c.title);
  return { ...ctx, coGm, player, reader, board, ok, card, cell };
}

describe('plot boards', () => {
  it('starts from any template, with its beats as columns and one storyline', async () => {
    const { api, w } = await setup();
    for (const key of PLOT_TEMPLATE_KEYS) {
      const res = await api.post(`${w}/plot`, { name: `From ${key}`, template: key });
      expect(res.statusCode, res.body).toBe(201);
      const board = res.json<PlotBoard>();
      expect(board.templateKey).toBe(key);
      expect(board.beats.map((b) => b.title)).toEqual(
        PLOT_TEMPLATES[key].beats.map((b) => b.title),
      );
      expect(board.threads).toEqual([
        expect.objectContaining({ name: 'Main plot', color: '#6366f1' }),
      ]);
      expect(board.cards).toEqual([]);
    }
    // The default is three-act.
    const plain = (await api.post(`${w}/plot`, { name: 'Default' })).json<PlotBoard>();
    expect(plain.templateKey).toBe('three_act');
    expect(plain.beats).toHaveLength(PLOT_TEMPLATES.three_act.beats.length);
  });

  it('has real structures: the famous ones have their usual number of beats', () => {
    expect(PLOT_TEMPLATES.save_the_cat.beats).toHaveLength(15);
    expect(PLOT_TEMPLATES.heros_journey.beats).toHaveLength(12);
    expect(PLOT_TEMPLATES.kishotenketsu.beats).toHaveLength(4);
    for (const template of Object.values(PLOT_TEMPLATES)) {
      const titles = template.beats.map((b) => b.title);
      expect(new Set(titles).size).toBe(titles.length);
      expect(titles.every((t) => t.length > 0)).toBe(true);
    }
  });

  it('lists boards with their sizes, renames and deletes them', async () => {
    const { api, w, board, card } = await setup();
    const b = await board('Book one', 'kishotenketsu');
    await card(b, 'A card');
    const list = (await api.get(`${w}/plot`)).json<PlotBoardSummary[]>();
    expect(list).toEqual([
      expect.objectContaining({
        name: 'Book one',
        templateKey: 'kishotenketsu',
        beatCount: 4,
        threadCount: 1,
        cardCount: 1,
      }),
    ]);
    const renamed = (await api.patch(`${w}/plot/${b.id}`, { name: 'Book 1' })).json<PlotBoard>();
    expect(renamed.name).toBe('Book 1');
    expect((await api.patch(`${w}/plot/${b.id}`, { name: ' ' })).statusCode).toBe(400);
    expect((await api.delete(`${w}/plot/${b.id}`)).statusCode).toBe(204);
    expect((await api.get(`${w}/plot/${b.id}`)).statusCode).toBe(404);
    expect((await api.get(`${w}/plot`)).json()).toEqual([]);
  });

  it('limits how many boards a world can have', async () => {
    const { api, w } = await setup();
    for (let i = 0; i < MAX_PLOT_BOARDS; i++) {
      expect((await api.post(`${w}/plot`, { name: `B${i}`, template: 'blank' })).statusCode).toBe(
        201,
      );
    }
    expect((await api.post(`${w}/plot`, { name: 'One too many' })).statusCode).toBe(400);
  });

  it('is the GM’s alone: nobody else reads or changes a board', async () => {
    const { api, w, board, player, reader, coGm, cookie } = await setup();
    const b = await board();
    for (const other of [player.api, reader.api]) {
      expect((await other.get(`${w}/plot`)).statusCode).toBe(403);
      expect((await other.get(`${w}/plot/${b.id}`)).statusCode).toBe(403);
      expect((await other.post(`${w}/plot`, { name: 'x' })).statusCode).toBe(403);
      expect((await other.delete(`${w}/plot/${b.id}`)).statusCode).toBe(403);
    }
    // A GM previewing another view is in that view, so it is not there either.
    const preview = apiClient(app, cookie, { 'x-view-as': 'player' });
    expect((await preview.get(`${w}/plot`)).statusCode).toBe(403);
    expect((await preview.post(`${w}/plot`, { name: 'x' })).statusCode).toBe(403);
    // A co-GM can.
    expect((await coGm.api.get(`${w}/plot/${b.id}`)).statusCode).toBe(200);
    expect((await coGm.api.post(`${w}/plot`, { name: 'Co-GM board' })).statusCode).toBe(201);
    expect(api).toBeDefined();
  });

  it('is included in the JSON export, with its cards', async () => {
    const { api, w, board, card } = await setup();
    await card(await board('Book', 'kishotenketsu'), 'A card');
    const data = (await api.get(`${w}/export`)).json<{ plotBoards: PlotBoard[] }>();
    expect(data.plotBoards).toHaveLength(1);
    expect(data.plotBoards[0]).toMatchObject({ name: 'Book' });
    expect(data.plotBoards[0]!.beats).toHaveLength(4);
    expect(data.plotBoards[0]!.cards.map((c) => c.title)).toEqual(['A card']);
  });

  it('is private to its world', async () => {
    const mine = await setup();
    const other = await signUpWithWorld(app, 'Elsewhere');
    const b = await mine.board();
    expect((await other.api.get(`${mine.w}/plot`)).statusCode).toBe(404);
    // Another world's board id is not found through your own world either.
    expect((await other.api.get(`${other.w}/plot/${b.id}`)).statusCode).toBe(404);
    expect((await other.api.delete(`${other.w}/plot/${b.id}`)).statusCode).toBe(404);
    expect(
      (
        await other.api.post(`${other.w}/plot/${b.id}/cards`, {
          beatId: b.beats[0]!.id,
          threadId: b.threads[0]!.id,
          title: 'x',
        })
      ).statusCode,
    ).toBe(404);
    expect((await mine.api.get(`${mine.w}/plot/${b.id}`)).statusCode).toBe(200);
  });
});

describe('beats and storylines', () => {
  it('adds, edits and removes beats, keeping at least one', async () => {
    const { api, w, board, ok } = await setup();
    const b = await board();
    const added = await ok(
      await api.post(`${w}/plot/${b.id}/beats`, {
        title: 'Twist',
        description: 'Something changes',
      }),
    );
    expect(added.beats.map((x) => x.title)).toEqual(['Beat 1', 'Twist']);
    const edited = await ok(
      await api.patch(`${w}/plot/${b.id}/beats/${added.beats[1]!.id}`, { title: 'Big twist' }),
    );
    expect(edited.beats[1]).toMatchObject({ title: 'Big twist', description: 'Something changes' });
    expect(
      (await api.patch(`${w}/plot/${b.id}/beats/${b.beats[0]!.id}`, { title: '' })).statusCode,
    ).toBe(400);
    const gone = await ok(await api.delete(`${w}/plot/${b.id}/beats/${added.beats[1]!.id}`));
    expect(gone.beats).toHaveLength(1);
    expect((await api.delete(`${w}/plot/${b.id}/beats/${gone.beats[0]!.id}`)).statusCode).toBe(400);
    expect((await api.delete(`${w}/plot/${b.id}/beats/${added.beats[1]!.id}`)).statusCode).toBe(
      404,
    );
  });

  it('adds, recolours and removes storylines, keeping at least one', async () => {
    const { api, w, board, ok } = await setup();
    const b = await board();
    const added = await ok(
      await api.post(`${w}/plot/${b.id}/threads`, { name: 'Romance', color: '#ef4444' }),
    );
    expect(added.threads.map((t) => t.name)).toEqual(['Main plot', 'Romance']);
    const edited = await ok(
      await api.patch(`${w}/plot/${b.id}/threads/${added.threads[1]!.id}`, { color: '#10b981' }),
    );
    expect(edited.threads[1]).toMatchObject({ name: 'Romance', color: '#10b981' });
    expect(
      (await api.post(`${w}/plot/${b.id}/threads`, { name: 'Bad', color: 'red' })).statusCode,
    ).toBe(400);
    const gone = await ok(await api.delete(`${w}/plot/${b.id}/threads/${added.threads[0]!.id}`));
    expect(gone.threads.map((t) => t.name)).toEqual(['Romance']);
    expect((await api.delete(`${w}/plot/${b.id}/threads/${gone.threads[0]!.id}`)).statusCode).toBe(
      400,
    );
  });

  it('takes the cards with a beat or storyline that is removed', async () => {
    const { api, w, board, card, ok } = await setup();
    let b = await board('Book', 'kishotenketsu');
    b = await ok(await api.post(`${w}/plot/${b.id}/threads`, { name: 'B plot' }));
    b = await card(b, 'In beat 1', { beat: 0, thread: 0 });
    b = await card(b, 'In beat 2', { beat: 1, thread: 0 });
    b = await card(b, 'In B plot', { beat: 1, thread: 1 });
    expect(b.cards).toHaveLength(3);
    b = await ok(await api.delete(`${w}/plot/${b.id}/beats/${b.beats[1]!.id}`));
    expect(b.cards.map((c) => c.title)).toEqual(['In beat 1']);
    b = await card(b, 'Again', { beat: 0, thread: 1 });
    b = await ok(await api.delete(`${w}/plot/${b.id}/threads/${b.threads[1]!.id}`));
    expect(b.cards.map((c) => c.title)).toEqual(['In beat 1']);
  });

  it('reorders columns and rows, and insists on a complete list', async () => {
    const { api, w, board, ok } = await setup();
    let b = await board('Book', 'kishotenketsu');
    b = await ok(await api.post(`${w}/plot/${b.id}/threads`, { name: 'Second' }));
    const ids = b.beats.map((x) => x.id);
    const reversed = [...ids].reverse();
    const done = await ok(
      await api.put(`${w}/plot/${b.id}/order`, {
        beatIds: reversed,
        threadIds: b.threads.map((t) => t.id).reverse(),
      }),
    );
    expect(done.beats.map((x) => x.id)).toEqual(reversed);
    expect(done.threads.map((t) => t.name)).toEqual(['Second', 'Main plot']);
    for (const bad of [
      { beatIds: ids.slice(1) },
      { beatIds: [...ids, ids[0]] },
      { beatIds: [ids[0], ids[0], ids[1], ids[2]] },
      { beatIds: ids.map((_, i) => (i === 0 ? '00000000-0000-4000-8000-000000000000' : ids[i])) },
      {},
    ]) {
      expect((await api.put(`${w}/plot/${b.id}/order`, bad)).statusCode, JSON.stringify(bad)).toBe(
        400,
      );
    }
    // A failed reorder changes nothing.
    expect((await ok(await api.get(`${w}/plot/${b.id}`))).beats.map((x) => x.id)).toEqual(reversed);
  });
});

describe('cards', () => {
  it('puts cards in cells, in the order they were added', async () => {
    const { board, card, cell } = await setup();
    let b = await board('Book', 'kishotenketsu');
    b = await card(b, 'One');
    b = await card(b, 'Two');
    b = await card(b, 'Elsewhere', { beat: 2, thread: 0 });
    expect(cell(b, 0, 0)).toEqual(['One', 'Two']);
    expect(cell(b, 2, 0)).toEqual(['Elsewhere']);
    expect(b.cards[0]).toMatchObject({ text: '', sceneId: null, color: null });
  });

  it('edits a card’s title, text and colour, and checks them', async () => {
    const { api, w, board, card, ok } = await setup();
    let b = await board();
    b = await card(b, 'Draft');
    const id = b.cards[0]!.id;
    b = await ok(
      await api.patch(`${w}/plot/${b.id}/cards/${id}`, {
        title: 'Final',
        text: 'Mira lies',
        color: '#f59e0b',
      }),
    );
    expect(b.cards[0]).toMatchObject({ title: 'Final', text: 'Mira lies', color: '#f59e0b' });
    b = await ok(await api.patch(`${w}/plot/${b.id}/cards/${id}`, { color: null }));
    expect(b.cards[0]!.color).toBeNull();
    for (const bad of [{ title: ' ' }, { color: 'orange' }, { text: 'x'.repeat(5001) }]) {
      expect((await api.patch(`${w}/plot/${b.id}/cards/${id}`, bad)).statusCode).toBe(400);
    }
    expect(
      (await api.patch(`${w}/plot/${b.id}/cards/${b.beats[0]!.id}`, { title: 'x' })).statusCode,
    ).toBe(404);
  });

  it('rejects cells that belong to another board', async () => {
    const { api, w, board, card } = await setup();
    const a = await board('A', 'kishotenketsu');
    const other = await board('B', 'kishotenketsu');
    const res = await api.post(`${w}/plot/${a.id}/cards`, {
      beatId: other.beats[0]!.id,
      threadId: a.threads[0]!.id,
      title: 'Wrong board',
    });
    expect(res.statusCode).toBe(400);
    const mine = await card(a, 'Right');
    const move = await api.post(`${w}/plot/${a.id}/cards/${mine.cards[0]!.id}/move`, {
      beatId: a.beats[0]!.id,
      threadId: other.threads[0]!.id,
      index: 0,
    });
    expect(move.statusCode).toBe(400);
    // The database refuses it too, whatever the code does.
    await expect(
      db.insert(plotCards).values({
        boardId: a.id,
        beatId: other.beats[0]!.id,
        threadId: a.threads[0]!.id,
        title: 'Sneaky',
        sortOrder: 0,
      }),
    ).rejects.toThrow();
  });

  it('links a card to a scene, drops the link if the scene goes, and refuses a non-scene', async () => {
    const { api, w, board, card, ok } = await setup();
    const book = (
      await api.post(`${w}/manuscript/nodes`, { kind: 'book', title: 'Book' })
    ).json<ManuscriptNode>();
    const chapter = (
      await api.post(`${w}/manuscript/nodes`, { kind: 'chapter', title: 'Ch 1', parentId: book.id })
    ).json<ManuscriptNode>();
    const scene = (
      await api.post(`${w}/manuscript/nodes`, {
        kind: 'scene',
        title: 'Docks',
        parentId: chapter.id,
      })
    ).json<ManuscriptNode>();
    let b = await board();
    b = await card(b, 'Docks fight');
    const id = b.cards[0]!.id;
    b = await ok(await api.patch(`${w}/plot/${b.id}/cards/${id}`, { sceneId: scene.id }));
    expect(b.cards[0]!.sceneId).toBe(scene.id);
    expect(
      (await api.patch(`${w}/plot/${b.id}/cards/${id}`, { sceneId: chapter.id })).statusCode,
    ).toBe(400);
    expect(
      (
        await api.patch(`${w}/plot/${b.id}/cards/${id}`, {
          sceneId: '00000000-0000-4000-8000-000000000000',
        })
      ).statusCode,
    ).toBe(400);
    await api.delete(`${w}/manuscript/nodes/${scene.id}`);
    b = await ok(await api.get(`${w}/plot/${b.id}`));
    expect(b.cards[0]).toMatchObject({ title: 'Docks fight', sceneId: null });
    // A scene of another world cannot be linked.
    const other = await signUpWithWorld(app, 'Elsewhere');
    const theirBook = (
      await other.api.post(`${other.w}/manuscript/nodes`, { kind: 'book', title: 'Their book' })
    ).json<ManuscriptNode>();
    const theirChapter = (
      await other.api.post(`${other.w}/manuscript/nodes`, {
        kind: 'chapter',
        title: 'Their chapter',
        parentId: theirBook.id,
      })
    ).json<ManuscriptNode>();
    const foreign = (
      await other.api.post(`${other.w}/manuscript/nodes`, {
        kind: 'scene',
        title: 'Theirs',
        parentId: theirChapter.id,
      })
    ).json<ManuscriptNode>();
    expect(foreign.id).toBeTruthy();
    expect(
      (await api.patch(`${w}/plot/${b.id}/cards/${id}`, { sceneId: foreign.id })).statusCode,
    ).toBe(400);
  });

  it('moves a card within its cell, and clamps an index that is too big', async () => {
    const { api, w, board, card, cell, ok } = await setup();
    let b = await board('Book', 'kishotenketsu');
    for (const t of ['A', 'B', 'C', 'D']) b = await card(b, t);
    const move = async (title: string, index: number) => {
      const id = b.cards.find((c) => c.title === title)!.id;
      b = await ok(
        await api.post(`${w}/plot/${b.id}/cards/${id}/move`, {
          beatId: b.beats[0]!.id,
          threadId: b.threads[0]!.id,
          index,
        }),
      );
    };
    await move('D', 0);
    expect(cell(b, 0, 0)).toEqual(['D', 'A', 'B', 'C']);
    await move('D', 2);
    expect(cell(b, 0, 0)).toEqual(['A', 'B', 'D', 'C']);
    await move('A', 99);
    expect(cell(b, 0, 0)).toEqual(['B', 'D', 'C', 'A']);
  });

  it('moves a card to another cell, and closes the gap behind it', async () => {
    const { api, w, board, card, cell, ok } = await setup();
    let b = await board('Book', 'kishotenketsu');
    b = await ok(await api.post(`${w}/plot/${b.id}/threads`, { name: 'Second' }));
    for (const t of ['A', 'B', 'C']) b = await card(b, t);
    b = await card(b, 'X', { beat: 1, thread: 1 });
    b = await card(b, 'Y', { beat: 1, thread: 1 });
    const bId = b.cards.find((c) => c.title === 'B')!.id;
    b = await ok(
      await api.post(`${w}/plot/${b.id}/cards/${bId}/move`, {
        beatId: b.beats[1]!.id,
        threadId: b.threads[1]!.id,
        index: 1,
      }),
    );
    expect(cell(b, 0, 0)).toEqual(['A', 'C']);
    expect(cell(b, 1, 1)).toEqual(['X', 'B', 'Y']);
    // The order is stored, not just shown: a fresh read agrees.
    const fresh = await ok(await api.get(`${w}/plot/${b.id}`));
    expect(cell(fresh, 0, 0)).toEqual(['A', 'C']);
    expect(cell(fresh, 1, 1)).toEqual(['X', 'B', 'Y']);
    const orders = (
      await db
        .select({ o: plotCards.sortOrder, beat: plotCards.beatId, thread: plotCards.threadId })
        .from(plotCards)
    )
      .filter((r) => r.beat === b.beats[0]!.id && r.thread === b.threads[0]!.id)
      .map((r) => r.o)
      .sort();
    expect(orders).toEqual([0, 1]);
  });

  it('keeps every cell numbered 0..n even when moves arrive at the same time', async () => {
    const { api, w, board, card, ok } = await setup();
    let b = await board('Book', 'kishotenketsu');
    for (const t of ['A', 'B', 'C', 'D', 'E', 'F']) b = await card(b, t);
    const results = await Promise.all(
      b.cards.map((c, i) =>
        api.post(`${w}/plot/${b.id}/cards/${c.id}/move`, {
          beatId: b.beats[i % 3]!.id,
          threadId: b.threads[0]!.id,
          index: 0,
        }),
      ),
    );
    expect(results.every((r) => r.statusCode === 200)).toBe(true);
    const fresh = await ok(await api.get(`${w}/plot/${b.id}`));
    expect(fresh.cards).toHaveLength(6);
    const rows = await db.select().from(plotCards);
    const mine = rows.filter((r) => r.boardId === b.id);
    for (const beat of b.beats) {
      const orders = mine
        .filter((r) => r.beatId === beat.id)
        .map((r) => r.sortOrder)
        .sort();
      expect(orders).toEqual(orders.map((_, i) => i));
    }
  });

  it('deletes a card and renumbers the rest of its cell', async () => {
    const { api, w, board, card, cell, ok } = await setup();
    let b = await board();
    for (const t of ['A', 'B', 'C']) b = await card(b, t);
    b = await ok(await api.delete(`${w}/plot/${b.id}/cards/${b.cards[1]!.id}`));
    expect(cell(b, 0, 0)).toEqual(['A', 'C']);
    const next = await card(b, 'D');
    expect(cell(next, 0, 0)).toEqual(['A', 'C', 'D']);
    expect((await api.delete(`${w}/plot/${b.id}/cards/${b.cards[1]!.id}`)).statusCode).toBe(200);
    expect(
      (await api.delete(`${w}/plot/${b.id}/cards/00000000-0000-4000-8000-000000000000`)).statusCode,
    ).toBe(404);
  });

  it('lets only editors change cards', async () => {
    const { w, board, card, player } = await setup();
    const b = await card(await board(), 'Secret');
    expect(
      (
        await player.api.post(`${w}/plot/${b.id}/cards`, {
          beatId: b.beats[0]!.id,
          threadId: b.threads[0]!.id,
          title: 'x',
        })
      ).statusCode,
    ).toBe(403);
    expect(
      (
        await player.api.post(`${w}/plot/${b.id}/cards/${b.cards[0]!.id}/move`, {
          beatId: b.beats[0]!.id,
          threadId: b.threads[0]!.id,
          index: 0,
        })
      ).statusCode,
    ).toBe(403);
    expect((await player.api.delete(`${w}/plot/${b.id}/cards/${b.cards[0]!.id}`)).statusCode).toBe(
      403,
    );
  });
});
