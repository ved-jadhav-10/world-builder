import { randomUUID } from 'node:crypto';
import { inflateSync } from 'node:zlib';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Entity, ManuscriptNode, RichTextDoc } from '@atlas/shared';
import { buildApp } from '../src/app';
import { joinWorld, signUpWithWorld, type TestApp } from './helpers';

let app: TestApp;
beforeAll(async () => {
  app = await buildApp();
});
afterAll(() => app.close());

const para = (...content: unknown[]) => ({ type: 'paragraph', content });
const text = (t: string) => ({ type: 'text', text: t });
const doc = (...content: unknown[]): RichTextDoc => ({ type: 'doc', content });

/** The words drawn on a PDF's pages, read back from its (compressed) content streams. */
function pdfText(payload: Buffer): string {
  const raw = payload.toString('latin1');
  const pages: string[] = [];
  for (const match of raw.matchAll(/stream\r?\n([\s\S]*?)\r?\nendstream/g)) {
    let stream: string;
    try {
      stream = inflateSync(Buffer.from(match[1]!, 'latin1')).toString('latin1');
    } catch {
      continue;
    }
    if (!stream.includes(' TJ')) continue;
    const words: string[] = [];
    for (const array of stream.matchAll(/\[([^\]]*)\]\s*TJ/g)) {
      for (const hex of array[1]!.matchAll(/<([0-9a-fA-F]*)>/g)) {
        words.push(Buffer.from(hex[1]!, 'hex').toString('latin1'));
      }
      words.push('\n');
    }
    pages.push(words.join(''));
  }
  return pages.join('\f');
}
const pageCount = (payload: Buffer) =>
  (payload.toString('latin1').match(/\/Type \/Page\b(?!s)/g) ?? []).length;

async function setup() {
  const ctx = await signUpWithWorld(app);
  const { api, w } = ctx;
  const player = await joinWorld(app, ctx.world.id, 'player');
  const node = async (kind: string, title: string, parentId?: string, summary = '') => {
    const made = (
      await api.post(`${w}/manuscript/nodes`, { kind, title, parentId })
    ).json<ManuscriptNode>();
    if (summary) await api.patch(`${w}/manuscript/nodes/${made.id}`, { summary });
    return made;
  };
  const write = (id: string, body: RichTextDoc) =>
    api.put(`${w}/manuscript/scenes/${id}/body`, { body });
  const story = async () => {
    const book = await node('book', 'The Salt Road');
    const one = await node('chapter', 'The Docks', book.id);
    const two = await node('chapter', 'The Storm', book.id);
    const s1 = await node('scene', 'Arrival', one.id, 'Mira lands.');
    const s2 = await node('scene', 'Market', one.id);
    const s3 = await node('scene', 'Wind', two.id);
    await write(s1.id, doc(para(text('Mira reached the docks at dawn, near Wrocław with Zoë.'))));
    await write(s2.id, doc(para(text('Second scene.'))));
    await write(s3.id, doc(para(text('The wind rose.'))));
    return book;
  };
  return { ...ctx, player, node, write, story };
}

describe('manuscript export as PDF', () => {
  it('makes a PDF with a title page, chapters, scenes and a running header', async () => {
    const { api, w, story } = await setup();
    await story();
    const res = await api.get(`${w}/export/manuscript.pdf?author=Mira%20Vey`);
    expect(res.statusCode, res.body).toBe(200);
    expect(res.headers['content-type']).toBe('application/pdf');
    expect(String(res.headers['content-disposition'])).toContain('The%20Salt%20Road.pdf');
    expect(res.rawPayload.subarray(0, 5).toString()).toBe('%PDF-');
    // A title page, then a page for each chapter (or more).
    expect(pageCount(res.rawPayload)).toBeGreaterThanOrEqual(3);

    const words = pdfText(res.rawPayload);
    expect(words).toContain('THE SALT ROAD');
    expect(words).toContain('by Mira Vey');
    const at = (s: string) => words.indexOf(s);
    expect(at('The Docks')).toBeGreaterThan(-1);
    expect(at('The Docks')).toBeLessThan(at('Mira reached the docks'));
    expect(at('Second scene.')).toBeLessThan(at('The Storm'));
    expect(at('The Storm')).toBeLessThan(at('The wind rose.'));
    // The header carries the surname, title and page; the title page has none.
    expect(words).toContain('Vey / The Salt Road / 1');
    expect(words).toContain('Vey / The Salt Road / 2');
    expect(words).not.toContain('Vey / The Salt Road / 0');
    // Letters the standard fonts have stay; those they lack become plain ones.
    expect(words).toContain('Zoë');
    expect(words).toContain('Wroclaw');
  });

  it('has a clean layout, and a scene break between scenes', async () => {
    const { api, w, story } = await setup();
    await story();
    const clean = pdfText((await api.get(`${w}/export/manuscript.pdf?format=clean`)).rawPayload);
    expect(clean).toContain('* * *');
    const plain = pdfText((await api.get(`${w}/export/manuscript.pdf`)).rawPayload);
    expect(plain).toContain('#');
    expect(plain).not.toContain('* * *');
  });

  it('can export one book on A4, and refuses an empty manuscript or a stranger', async () => {
    const { api, w, story, node, player } = await setup();
    expect((await api.get(`${w}/export/manuscript.pdf`)).statusCode).toBe(400);
    const book = await story();
    await node('book', 'Second Book');
    const one = await api.get(`${w}/export/manuscript.pdf?bookId=${book.id}&paper=a4`);
    expect(one.statusCode).toBe(200);
    expect(pdfText(one.rawPayload)).not.toContain('SECOND BOOK');
    expect(one.rawPayload.toString('latin1')).toContain('595.28');
    expect((await api.get(`${w}/export/manuscript.pdf?bookId=${randomUUID()}`)).statusCode).toBe(
      404,
    );
    expect((await player.api.get(`${w}/export/manuscript.pdf`)).statusCode).toBe(403);
  });
});

describe('story bible PDF', () => {
  it('lists every entry by type with its details, the timeline and the manuscript outline', async () => {
    const ctx = await setup();
    const { api, w } = ctx;
    const make = async (type: string, name: string, extra: object = {}) => {
      const res = await api.post(`${w}/entities`, { typeId: ctx.typeId(type), name, ...extra });
      expect(res.statusCode, res.body).toBe(201);
      return res.json<Entity>();
    };
    const maren = await make('character', 'Maren Vael', {
      summary: 'A squire turned captain.',
      aliases: ['Mare'],
      startDay: 100,
      fields: { life_status: 'Alive', abilities: [{ name: 'Second wind' }] },
      body: doc(para(text('She hates the sea.'))),
    });
    const vael = await make('location', 'Vael Harbour', { startDay: 40 });
    const types = (await api.get(`${w}/relationship-types`)).json<{ id: string; key: string }[]>();
    await api.post(`${w}/relationships`, {
      sourceId: maren.id,
      targetId: vael.id,
      typeId: types.find((t) => t.key === 'located_in')!.id,
    });
    await ctx.story();

    const res = await api.get(`${w}/export/story-bible.pdf`);
    expect(res.statusCode, res.body).toBe(200);
    expect(res.headers['content-type']).toBe('application/pdf');
    expect(String(res.headers['content-disposition'])).toContain('story-bible.pdf');
    const words = pdfText(res.rawPayload);
    for (const expected of [
      'Aerth',
      'Story bible',
      'Character',
      'Maren Vael',
      'Also known as Mare',
      'A squire turned captain.',
      'Alive',
      'Second wind',
      'She hates the sea.',
      'located in Vael Harbour',
      'Timeline',
      'Manuscript outline',
      'Mira lands.',
    ]) {
      expect(words, expected).toContain(expected);
    }
    // The location was founded first, so it comes first on the timeline.
    const timeline = words.slice(words.lastIndexOf('Timeline'));
    expect(timeline.indexOf('Vael Harbour')).toBeLessThan(timeline.indexOf('Maren Vael'));
  });

  it('is for editors only', async () => {
    const { w, player } = await setup();
    expect((await player.api.get(`${w}/export/story-bible.pdf`)).statusCode).toBe(403);
  });
});
