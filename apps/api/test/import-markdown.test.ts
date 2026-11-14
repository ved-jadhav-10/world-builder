import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type {
  Entity,
  EntityRelationship,
  EntitySummary,
  MarkdownImportResult,
  Page,
} from '@atlas/shared';
import { buildApp } from '../src/app';
import { joinWorld, signUpWithWorld, type TestApp } from './helpers';

let app: TestApp;
beforeAll(async () => {
  app = await buildApp();
});
afterAll(() => app.close());

const notes = [
  {
    path: 'Characters/Mira Vey.md',
    content:
      '---\naliases: [Mira]\ntags: [main-cast]\n---\n# Mira Vey\n\nRuns [[The Gilded Eel]] in [[Vesh]].\n\n## Manner\n- Dry\n',
  },
  { path: 'Places/Vesh.md', content: 'A harbour city. Home of [[Mira Vey]].' },
  { path: 'Places/The Gilded Eel.md', content: 'A tavern in [[Vesh]] and nowhere else.' },
  { path: 'Odds/Salt tax.md', content: 'Raised three times this year.' },
];
const links = [
  { from: 'Mira Vey', to: 'The Gilded Eel' },
  { from: 'Mira Vey', to: 'Vesh' },
  { from: 'Vesh', to: 'Mira Vey' },
  { from: 'The Gilded Eel', to: 'Vesh' },
  { from: 'Vesh', to: 'Nowhere Written Down' },
];

describe('importing Markdown notes', () => {
  it('makes an entry per note, by folder, with tags, and links them afterwards', async () => {
    const gm = await signUpWithWorld(app);
    const res = await gm.api.post(`${gm.w}/import/markdown`, { notes });
    expect(res.statusCode, res.body).toBe(200);
    expect(res.json<MarkdownImportResult>()).toEqual({
      created: 4,
      skipped: [],
      byType: { Character: 1, Location: 2, 'Lore Article': 1 },
    });

    const list = (await gm.api.get(`${gm.w}/entities?limit=50`)).json<Page<EntitySummary>>().items;
    const mira = list.find((entity) => entity.name === 'Mira Vey')!;
    expect(mira.typeId).toBe(gm.typeId('character'));
    expect(mira.aliases).toEqual(['Mira']);
    expect(mira.visibility).toBe('gm');
    const full = (await gm.api.get(`${gm.w}/entities/${mira.id}`)).json<Entity>();
    expect(full.tags.map((tag) => tag.name)).toEqual(['main-cast']);
    expect(JSON.stringify(full.body)).toContain('Runs The Gilded Eel in Vesh.');
    expect(JSON.stringify(full.body)).not.toContain('[[');

    const linked = await gm.api.post(`${gm.w}/import/markdown/links`, { links });
    expect(linked.json()).toEqual({ linked: 4 });
    const miraLinks = (await gm.api.get(`${gm.w}/entities/${mira.id}/relationships`)).json<
      EntityRelationship[]
    >();
    expect(miraLinks.map((link) => `${link.label} ${link.other.name}`).sort()).toEqual([
      'mentioned in Vesh',
      'mentions The Gilded Eel',
      'mentions Vesh',
    ]);

    // A second run of the same vault adds nothing.
    const again = (
      await gm.api.post(`${gm.w}/import/markdown`, { notes })
    ).json<MarkdownImportResult>();
    expect(again.created).toBe(0);
    expect(again.skipped).toHaveLength(4);
    expect((await gm.api.post(`${gm.w}/import/markdown/links`, { links })).json()).toEqual({
      linked: 0,
    });
  });

  it('is for editors only, and checks what it is sent', async () => {
    const gm = await signUpWithWorld(app);
    const player = await joinWorld(app, gm.world.id, 'player');
    expect((await player.api.post(`${gm.w}/import/markdown`, { notes })).statusCode).toBe(403);
    expect((await gm.api.post(`${gm.w}/import/markdown`, { notes: [] })).statusCode).toBe(400);
    const preview = await app.inject({
      method: 'POST',
      url: `/api${gm.w}/import/markdown`,
      headers: { cookie: gm.cookie, 'x-view-as': 'player' },
      payload: { notes },
    });
    expect(preview.statusCode).toBe(403);
  });
});
