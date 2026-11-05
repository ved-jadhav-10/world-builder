import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  MAX_COMMENTS_PER_SUBJECT,
  type Comment,
  type Entity,
  type InboxThread,
  type ManuscriptNode,
  type WorldExport,
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
  const { api, w, typeId, world, cookie } = ctx;
  const entry = async (name: string, visibility = 'reader') =>
    (
      await api.post(`${w}/entities`, { typeId: typeId('character'), name, visibility })
    ).json<Entity>();
  const book = (
    await api.post(`${w}/manuscript/nodes`, { kind: 'book', title: 'Book' })
  ).json<ManuscriptNode>();
  const chapter = (
    await api.post(`${w}/manuscript/nodes`, { kind: 'chapter', title: 'Ch', parentId: book.id })
  ).json<ManuscriptNode>();
  const scene = async (title: string) =>
    (
      await api.post(`${w}/manuscript/nodes`, { kind: 'scene', title, parentId: chapter.id })
    ).json<ManuscriptNode>();
  const commenter = await joinWorld(app, world.id, 'commenter');
  const editor = await joinWorld(app, world.id, 'editor');
  const player = await joinWorld(app, world.id, 'player');
  const reader = await joinWorld(app, world.id, 'reader');
  const say = async (
    path: string,
    body: string,
    client = api,
    extra: object = {},
    expected = 201,
  ) => {
    const res = await client.post(`${w}/${path}/comments`, { body, ...extra });
    expect(res.statusCode, res.body).toBe(expected);
    return res.json<Comment>();
  };
  return { ...ctx, entry, scene, commenter, editor, player, reader, say, cookie };
}

describe('comments', () => {
  it('start a thread on an entry, take replies and list oldest first', async () => {
    const { api, w, entry, say } = await setup();
    const mira = await entry('Mira');
    const first = await say(`entities/${mira.id}`, '  Is she too cold here?  ');
    expect(first).toMatchObject({
      body: 'Is she too cold here?',
      parentId: null,
      entityId: mira.id,
      nodeId: null,
      resolvedAt: null,
      editedAt: null,
    });
    expect(first.author?.name).toBeTruthy();
    const reply = await say(`entities/${mira.id}`, 'Maybe a little.', api, { parentId: first.id });
    expect(reply.parentId).toBe(first.id);

    const list = (await api.get(`${w}/entities/${mira.id}/comments`)).json<Comment[]>();
    expect(list.map((c) => c.id)).toEqual([first.id, reply.id]);
  });

  it('only let a reply answer the start of a thread, on the same entry', async () => {
    const { api, w, entry, say } = await setup();
    const a = await entry('A');
    const b = await entry('B');
    const root = await say(`entities/${a.id}`, 'Root');
    const reply = await say(`entities/${a.id}`, 'Reply', api, { parentId: root.id });
    expect(
      (await api.post(`${w}/entities/${a.id}/comments`, { body: 'Deep', parentId: reply.id }))
        .statusCode,
    ).toBe(400);
    expect(
      (await api.post(`${w}/entities/${b.id}/comments`, { body: 'Elsewhere', parentId: root.id }))
        .statusCode,
    ).toBe(404);
    expect((await api.post(`${w}/entities/${a.id}/comments`, { body: '   ' })).statusCode).toBe(
      400,
    );
  });

  it('work on scenes for the GM side', async () => {
    const { api, w, scene, say } = await setup();
    const s = await scene('The harbour');
    const c = await say(`manuscript/scenes/${s.id}`, 'Tighten the opening.');
    expect(c).toMatchObject({ nodeId: s.id, entityId: null });
    expect(
      (await api.get(`${w}/manuscript/scenes/${s.id}/comments`)).json<Comment[]>(),
    ).toHaveLength(1);
  });

  it('are for the owner, co-GMs and commenters only', async () => {
    const { w, entry, say, commenter, editor, player, reader, cookie } = await setup();
    const mira = await entry('Mira', 'public');
    await say(`entities/${mira.id}`, 'Team note');
    for (const who of [commenter, editor]) {
      expect((await who.api.get(`${w}/entities/${mira.id}/comments`)).statusCode).toBe(200);
    }
    for (const who of [player, reader]) {
      expect((await who.api.get(`${w}/entities/${mira.id}/comments`)).statusCode).toBe(403);
      expect(
        (await who.api.post(`${w}/entities/${mira.id}/comments`, { body: 'x' })).statusCode,
      ).toBe(403);
      expect((await who.api.get(`${w}/comments`)).statusCode).toBe(403);
    }
    // A GM previewing as a player sees none of it either.
    const preview = apiClient(app, cookie, { 'x-view-as': 'player' });
    expect((await preview.get(`${w}/entities/${mira.id}/comments`)).statusCode).toBe(403);
  });

  it('let a commenter comment on what readers can see, and nothing else', async () => {
    const { w, entry, scene, say, commenter } = await setup();
    const open = await entry('Open', 'reader');
    const publicOne = await entry('Public', 'public');
    const secret = await entry('Secret', 'gm');
    const playersOnly = await entry('Players only', 'player');
    const s = await scene('Draft');

    await say(`entities/${open.id}`, 'Nice', commenter.api);
    await say(`entities/${publicOne.id}`, 'Fine', commenter.api);
    for (const hidden of [secret, playersOnly]) {
      expect((await commenter.api.get(`${w}/entities/${hidden.id}/comments`)).statusCode).toBe(404);
      expect(
        (await commenter.api.post(`${w}/entities/${hidden.id}/comments`, { body: 'x' })).statusCode,
      ).toBe(404);
    }
    expect((await commenter.api.get(`${w}/manuscript/scenes/${s.id}/comments`)).statusCode).toBe(
      404,
    );
  });

  it('can be edited only by their author, and say so', async () => {
    const { api, w, entry, say, commenter } = await setup();
    const mira = await entry('Mira');
    const mine = await say(`entities/${mira.id}`, 'Mine', api);
    const theirs = await say(`entities/${mira.id}`, 'Theirs', commenter.api);

    const edited = await api.patch(`${w}/comments/${mine.id}`, { body: 'Mine, revised' });
    expect(edited.json<Comment>()).toMatchObject({ body: 'Mine, revised' });
    expect(edited.json<Comment>().editedAt).not.toBeNull();
    // Saving the same words is not an edit.
    const same = await api.patch(`${w}/comments/${mine.id}`, { body: 'Mine, revised' });
    expect(same.json<Comment>().editedAt).toBe(edited.json<Comment>().editedAt);

    expect((await api.patch(`${w}/comments/${theirs.id}`, { body: 'Hijack' })).statusCode).toBe(
      403,
    );
    expect(
      (await commenter.api.patch(`${w}/comments/${mine.id}`, { body: 'Hijack' })).statusCode,
    ).toBe(403);
    expect((await api.patch(`${w}/comments/${mine.id}`, {})).statusCode).toBe(400);
  });

  it('resolve as a thread, by the author or a co-GM', async () => {
    const { api, w, entry, say, commenter, editor } = await setup();
    const mira = await entry('Mira');
    const root = await say(`entities/${mira.id}`, 'Question?', commenter.api);
    const reply = await say(`entities/${mira.id}`, 'Answer.', api, { parentId: root.id });

    expect((await api.patch(`${w}/comments/${reply.id}`, { resolved: true })).statusCode).toBe(400);
    const other = await joinWorld(
      app,
      (await api.get(`${w}`)).json<{ id: string }>().id,
      'commenter',
    );
    expect((await other.api.patch(`${w}/comments/${root.id}`, { resolved: true })).statusCode).toBe(
      403,
    );

    const byAuthor = await commenter.api.patch(`${w}/comments/${root.id}`, { resolved: true });
    expect(byAuthor.json<Comment>().resolvedAt).not.toBeNull();
    const reopened = await editor.api.patch(`${w}/comments/${root.id}`, { resolved: false });
    expect(reopened.json<Comment>().resolvedAt).toBeNull();
    const byGm = await api.patch(`${w}/comments/${root.id}`, { resolved: true });
    expect(byGm.json<Comment>().resolvedAt).not.toBeNull();
  });

  it('can be removed by their author or a co-GM, and removing a thread removes its replies', async () => {
    const { api, w, entry, say, commenter, editor } = await setup();
    const mira = await entry('Mira');
    const root = await say(`entities/${mira.id}`, 'Root', commenter.api);
    const reply = await say(`entities/${mira.id}`, 'Reply', api, { parentId: root.id });
    const gms = await say(`entities/${mira.id}`, 'GM note');

    expect((await commenter.api.delete(`${w}/comments/${gms.id}`)).statusCode).toBe(403);
    expect((await commenter.api.delete(`${w}/comments/${reply.id}`)).statusCode).toBe(403);
    expect((await editor.api.delete(`${w}/comments/${gms.id}`)).statusCode).toBe(204);
    expect((await commenter.api.delete(`${w}/comments/${root.id}`)).statusCode).toBe(204);
    expect((await api.get(`${w}/entities/${mira.id}/comments`)).json()).toEqual([]);
    expect((await api.delete(`${w}/comments/${reply.id}`)).statusCode).toBe(404);
  });

  it('go away with their entry, and are hidden while it is in the trash', async () => {
    const { api, w, entry, say } = await setup();
    const mira = await entry('Mira');
    await say(`entities/${mira.id}`, 'Remember this');
    await api.delete(`${w}/entities/${mira.id}`);
    expect((await api.get(`${w}/entities/${mira.id}/comments`)).statusCode).toBe(404);
    expect((await api.get(`${w}/comments`)).json()).toEqual([]);
    await api.post(`${w}/trash/${mira.id}/restore`);
    expect((await api.get(`${w}/entities/${mira.id}/comments`)).json<Comment[]>()).toHaveLength(1);
  });

  it('keep to their own world', async () => {
    const { w, entry, say } = await setup();
    const other = await setup();
    const mira = await entry('Mira');
    const note = await say(`entities/${mira.id}`, 'Private');
    expect((await other.api.get(`${w}/entities/${mira.id}/comments`)).statusCode).toBe(404);
    expect(
      (await other.api.patch(`${other.w}/comments/${note.id}`, { body: 'x' })).statusCode,
    ).toBe(404);
  });

  it('stop at the limit on one entry', async () => {
    const { api, w, entry, world } = await setup();
    const mira = await entry('Mira');
    const { db } = await import('../src/db/client');
    const { comments } = await import('../src/db/schema');
    await db.insert(comments).values(
      Array.from({ length: MAX_COMMENTS_PER_SUBJECT }, (_, i) => ({
        worldId: world.id,
        entityId: mira.id,
        body: `c${i}`,
      })),
    );
    expect((await api.post(`${w}/entities/${mira.id}/comments`, { body: 'more' })).statusCode).toBe(
      409,
    );
  });

  it('are listed in an inbox, open first by default, only for what the person can see', async () => {
    const { api, w, entry, scene, say, commenter } = await setup();
    const open = await entry('Open', 'reader');
    const secret = await entry('Secret', 'gm');
    const s = await scene('Opening');
    const a = await say(`entities/${open.id}`, 'About open');
    await say(`entities/${open.id}`, 'Reply', api, { parentId: a.id });
    await say(`entities/${secret.id}`, 'About secret');
    await say(`manuscript/scenes/${s.id}`, 'About scene');
    const done = await say(`entities/${open.id}`, 'Done already');
    await api.patch(`${w}/comments/${done.id}`, { resolved: true });

    const inbox = async (client = api, query = '') =>
      (await client.get(`${w}/comments${query}`)).json<InboxThread[]>();
    const gm = await inbox();
    expect(gm.map((t) => t.comment.body).sort()).toEqual([
      'About open',
      'About scene',
      'About secret',
    ]);
    expect(gm.find((t) => t.comment.body === 'About open')).toMatchObject({
      replyCount: 1,
      subject: { kind: 'entity', id: open.id, title: 'Open' },
    });
    expect(gm.find((t) => t.comment.body === 'About scene')?.subject).toMatchObject({
      kind: 'scene',
      title: 'Opening',
    });
    expect((await inbox(api, '?status=resolved')).map((t) => t.comment.body)).toEqual([
      'Done already',
    ]);
    expect(await inbox(api, '?status=all')).toHaveLength(4);

    // A commenter sees only threads about what readers can see.
    expect((await inbox(commenter.api, '?status=all')).map((t) => t.comment.body).sort()).toEqual([
      'About open',
      'Done already',
    ]);
  });

  it('are in the world export', async () => {
    const { api, w, entry, say } = await setup();
    const mira = await entry('Mira');
    await say(`entities/${mira.id}`, 'Exported');
    const exported = (await api.get(`${w}/export`)).json<WorldExport>();
    expect(exported.comments.map((c) => c.body)).toEqual(['Exported']);
  });
});

describe('inviting commenters', () => {
  it('is possible, and the role keeps its limits', async () => {
    const { api, w } = await setup();
    const res = await api.post(`${w}/invites`, { role: 'commenter' });
    expect(res.statusCode, res.body).toBe(201);
    expect(res.json<{ role: string }>().role).toBe('commenter');
  });
});
