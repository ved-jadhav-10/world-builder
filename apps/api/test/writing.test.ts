import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type {
  ManuscriptNode,
  RevisionSummary,
  RichTextDoc,
  WritingSprint,
  WritingStats,
} from '@atlas/shared';
import { buildApp } from '../src/app';
import { apiClient, joinWorld, signUpWithWorld, type TestApp } from './helpers';

let app: TestApp;
beforeAll(async () => {
  app = await buildApp();
});
afterAll(() => app.close());

const words = (n: number) => Array.from({ length: n }, (_, i) => `word${i}`).join(' ');
const doc = (text: string): RichTextDoc => ({
  type: 'doc',
  content: [{ type: 'paragraph', content: [{ type: 'text', text }] }],
});

async function setup() {
  const ctx = await signUpWithWorld(app);
  const { api, w } = ctx;
  const coGm = await joinWorld(app, ctx.world.id, 'editor');
  const player = await joinWorld(app, ctx.world.id, 'player');
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
  const write = (id: string, count: number, client = api) =>
    client.put(`${w}/manuscript/scenes/${id}/body`, { body: doc(words(count)) });
  const stats = async (client = api, query = '') => {
    const res = await client.get(`${w}/writing${query}`);
    expect(res.statusCode, res.body).toBe(200);
    return res.json<WritingStats>();
  };
  const setGoals = (body: object, client = api) => client.put(`${w}/writing/goals`, body);
  return { ...ctx, coGm, player, scene, write, stats, setGoals };
}

describe('writing stats', () => {
  it('starts empty, with today’s date and no goals', async () => {
    const { stats } = await setup();
    const s = await stats();
    expect(s.today).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(s).toMatchObject({
      timezone: 'UTC',
      todayWords: 0,
      weekWords: 0,
      manuscriptWords: 0,
      progress: null,
      days: [],
      sprints: [],
      streaks: { current: 0, longest: 0 },
      goals: { dailyWords: null, totalWords: null, deadline: null },
    });
  });

  it('counts the words added by each save, and the words cut', async () => {
    const { scene, write, stats } = await setup();
    const a = await scene('A');
    const b = await scene('B');
    await write(a.id, 3);
    expect((await stats()).todayWords).toBe(3);
    // Saving the same scene again with more words adds only the difference.
    await write(a.id, 8);
    await write(a.id, 8);
    expect((await stats()).todayWords).toBe(8);
    await write(b.id, 10);
    expect((await stats()).todayWords).toBe(18);
    // Cutting counts against the day.
    await write(a.id, 2);
    const s = await stats();
    expect(s.todayWords).toBe(12);
    expect(s.manuscriptWords).toBe(12);
    expect(s.days).toEqual([{ day: s.today, words: 12 }]);
    expect(s.weekWords).toBe(12);
  });

  it('keeps each person’s words to themselves, and the manuscript total shared', async () => {
    const { scene, write, stats, coGm } = await setup();
    const a = await scene('A');
    await write(a.id, 5);
    await write(a.id, 9, coGm.api);
    expect((await stats()).todayWords).toBe(5);
    const theirs = await stats(coGm.api);
    expect(theirs.todayWords).toBe(4);
    expect(theirs.manuscriptWords).toBe(9);
  });

  it('does not count a restored version as writing', async () => {
    const { scene, write, stats, api, w } = await setup();
    const a = await scene('A');
    await write(a.id, 10);
    await write(a.id, 20);
    const versions = (await api.get(`${w}/manuscript/scenes/${a.id}/revisions`)).json<
      RevisionSummary[]
    >();
    const small = versions.find((v) => v.words === 0)!;
    await api.post(`${w}/manuscript/scenes/${a.id}/revisions/${small.id}/restore`);
    const s = await stats();
    expect(s.manuscriptWords).toBe(0);
    expect(s.todayWords).toBe(20);
  });
});

describe('goals, streaks and progress', () => {
  it('saves goals, clears them with null, and leaves the others alone', async () => {
    const { setGoals, stats } = await setup();
    const res = await setGoals({ dailyWords: 500, totalWords: 80000, deadline: '2999-12-31' });
    expect(res.statusCode, res.body).toBe(200);
    expect((await stats()).goals).toEqual({
      dailyWords: 500,
      totalWords: 80000,
      deadline: '2999-12-31',
    });
    await setGoals({ dailyWords: null });
    expect((await stats()).goals).toEqual({
      dailyWords: null,
      totalWords: 80000,
      deadline: '2999-12-31',
    });
  });

  it('refuses goals that make no sense', async () => {
    const { setGoals } = await setup();
    for (const body of [
      { dailyWords: 0 },
      { dailyWords: -5 },
      { dailyWords: 1.5 },
      { dailyWords: 200000 },
      { totalWords: 0 },
      { deadline: '2026-02-30' },
      { deadline: 'tomorrow' },
      { timezone: 'Mars/Olympus' },
    ]) {
      expect((await setGoals(body)).statusCode, JSON.stringify(body)).toBe(400);
    }
  });

  it('starts a streak when the daily goal is met, and shows manuscript progress', async () => {
    const { scene, write, stats, setGoals } = await setup();
    const a = await scene('A');
    await setGoals({ dailyWords: 100, totalWords: 1000, deadline: '2999-12-31' });
    await write(a.id, 60);
    expect((await stats()).streaks).toEqual({ current: 0, longest: 0 });
    await write(a.id, 120);
    const s = await stats();
    expect(s.streaks).toEqual({ current: 1, longest: 1 });
    expect(s.progress).toMatchObject({ words: 120, target: 1000, percent: 12 });
    expect(s.progress!.daysLeft).toBeGreaterThan(1000);
  });

  it('counts days in the person’s own time zone', async () => {
    const { stats, setGoals } = await setup();
    await setGoals({ timezone: 'Pacific/Kiritimati' });
    const s = await stats();
    const local = new Intl.DateTimeFormat('en-CA', { timeZone: 'Pacific/Kiritimati' }).format(
      new Date(),
    );
    expect(s.timezone).toBe('Pacific/Kiritimati');
    expect(s.today).toBe(local);
  });

  it('fixes the zone at first use, and does not shuffle it when travelling', async () => {
    const { stats } = await setup();
    const first = await stats(undefined, '?timezone=Asia/Tokyo');
    expect(first.timezone).toBe('Asia/Tokyo');
    expect((await stats(undefined, '?timezone=America/Chicago')).timezone).toBe('Asia/Tokyo');
    expect((await stats()).timezone).toBe('Asia/Tokyo');
  });

  it('limits how many weeks of days come back', async () => {
    const { scene, write, stats, api, w } = await setup();
    const a = await scene('A');
    await write(a.id, 5);
    expect((await stats(api, '?weeks=1')).days).toHaveLength(1);
    expect((await api.get(`${w}/writing?weeks=0`)).statusCode).toBe(400);
    expect((await api.get(`${w}/writing?weeks=54`)).statusCode).toBe(400);
  });
});

describe('sprints', () => {
  it('are saved and listed newest first', async () => {
    const { api, w, stats } = await setup();
    const first = await api.post(`${w}/writing/sprints`, { minutes: 15, words: 320 });
    expect(first.statusCode).toBe(201);
    expect(first.json<WritingSprint>()).toMatchObject({ minutes: 15, words: 320 });
    await api.post(`${w}/writing/sprints`, { minutes: 25, words: 0 });
    const s = await stats();
    expect(s.sprints.map((x) => x.minutes)).toEqual([25, 15]);
  });

  it('must make sense', async () => {
    const { api, w } = await setup();
    for (const body of [
      { minutes: 0, words: 5 },
      { minutes: 241, words: 5 },
      { minutes: 10, words: -1 },
      { minutes: 10.5, words: 5 },
      { minutes: 10 },
    ]) {
      expect((await api.post(`${w}/writing/sprints`, body)).statusCode, JSON.stringify(body)).toBe(
        400,
      );
    }
  });
});

describe('who can use it', () => {
  it('is the GM’s alone, and private to the world', async () => {
    const { api, w, player, cookie, coGm, setGoals } = await setup();
    expect((await player.api.get(`${w}/writing`)).statusCode).toBe(403);
    expect((await player.api.put(`${w}/writing/goals`, { dailyWords: 5 })).statusCode).toBe(403);
    expect(
      (await player.api.post(`${w}/writing/sprints`, { minutes: 5, words: 5 })).statusCode,
    ).toBe(403);
    expect(
      (await apiClient(app, cookie, { 'x-view-as': 'player' }).get(`${w}/writing`)).statusCode,
    ).toBe(403);
    expect((await setGoals({ dailyWords: 5 }, coGm.api)).statusCode).toBe(200);
    // Goals are personal: the co-GM's do not change the owner's.
    expect((await api.get(`${w}/writing`)).json<WritingStats>().goals.dailyWords).toBeNull();
    const other = await signUpWithWorld(app, 'Elsewhere');
    expect((await other.api.get(`${w}/writing`)).statusCode).toBe(404);
  });
});

describe('time zone names', () => {
  it('accepts the aliases browsers report, such as Asia/Calcutta', async () => {
    const ctx = await signUpWithWorld(app);
    const res = await ctx.api.get(
      `${ctx.w}/writing?timezone=${encodeURIComponent('Asia/Calcutta')}`,
    );
    expect(res.statusCode, res.body).toBe(200);
    expect(res.json<WritingStats>().timezone).toBe('Asia/Calcutta');
  });
});
