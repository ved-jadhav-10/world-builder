import { strFromU8, unzipSync } from 'fflate';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { ManuscriptNode, RichTextDoc } from '@atlas/shared';
import { buildApp } from '../src/app';
import { apiClient, joinWorld, signUpWithWorld, type TestApp } from './helpers';

let app: TestApp;
beforeAll(async () => {
  app = await buildApp();
});
afterAll(() => app.close());

const para = (...content: unknown[]) => ({ type: 'paragraph', content });
const text = (t: string, marks: unknown[] = []) => ({
  type: 'text',
  text: t,
  ...(marks.length ? { marks } : {}),
});
const doc = (...content: unknown[]): RichTextDoc => ({ type: 'doc', content });

async function setup() {
  const ctx = await signUpWithWorld(app);
  const { api, w } = ctx;
  const player = await joinWorld(app, ctx.world.id, 'player');
  const node = async (kind: string, title: string, parentId?: string) =>
    (await api.post(`${w}/manuscript/nodes`, { kind, title, parentId })).json<ManuscriptNode>();
  const write = (id: string, body: RichTextDoc) =>
    api.put(`${w}/manuscript/scenes/${id}/body`, { body });
  const download = async (query = '', client = api) =>
    client.get(`${w}/export/manuscript.docx${query}`);
  /** The parts of the .docx we look at, as text. */
  const read = (payload: Buffer) => {
    const files = unzipSync(new Uint8Array(payload));
    const part = (name: string) => (files[name] ? strFromU8(files[name]!) : '');
    const headers = Object.keys(files).filter((f) => f.startsWith('word/header'));
    return {
      body: part('word/document.xml'),
      header: headers.map(part).join(''),
      names: Object.keys(files),
    };
  };
  /** A book with two chapters and a few scenes. */
  const story = async () => {
    const book = await node('book', 'The Salt Road');
    const one = await node('chapter', 'The Docks', book.id);
    const two = await node('chapter', 'The Storm', book.id);
    const s1 = await node('scene', 'Arrival', one.id);
    const s2 = await node('scene', 'Market', one.id);
    const s3 = await node('scene', 'Empty', one.id);
    const s4 = await node('scene', 'Wind', two.id);
    await write(
      s1.id,
      doc(para(text('Mira reached the '), text('docks', [{ type: 'bold' }]), text(' at dawn.'))),
    );
    await write(
      s2.id,
      doc(
        para(text('Second scene.')),
        para(text('A link', [{ type: 'link', attrs: { href: 'https://example.com/x' } }])),
        para(text('Bad link', [{ type: 'link', attrs: { href: 'javascript:alert(1)' } }])),
      ),
    );
    await write(s4.id, doc(para(text('The wind rose.'))));
    return { book, one, two, s3 };
  };
  return { ...ctx, player, node, write, download, read, story };
}

describe('manuscript export as Word', () => {
  it('makes a .docx of the book with a title page, chapters and scenes', async () => {
    const { story, download, read } = await setup();
    await story();
    const res = await download('?author=Mira%20Vey');
    expect(res.statusCode, res.body).toBe(200);
    expect(res.headers['content-type']).toBe(
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    );
    expect(String(res.headers['content-disposition'])).toContain('The%20Salt%20Road.docx');
    const { body, header, names } = read(res.rawPayload);
    expect(names).toContain('word/document.xml');
    // Title page.
    expect(body).toContain('THE SALT ROAD');
    expect(body).toContain('by Mira Vey');
    expect(body).toContain('words');
    // Chapters and scene text, in order.
    const at = (s: string) => body.indexOf(s);
    expect(at('The Docks')).toBeGreaterThan(-1);
    expect(at('The Docks')).toBeLessThan(at('Mira reached the '));
    expect(at('Mira reached the ')).toBeLessThan(at('Second scene.'));
    expect(at('Second scene.')).toBeLessThan(at('The Storm'));
    expect(at('The Storm')).toBeLessThan(at('The wind rose.'));
    // Bold survives; the running header has the surname and title.
    expect(body).toMatch(/<w:b\/>[\s\S]{0,200}docks/);
    expect(header).toContain('Vey / The Salt Road / ');
  });

  it('puts a scene break between scenes, skips empty scenes, and none after the last', async () => {
    const { story, download, read } = await setup();
    await story();
    const { body } = read((await download()).rawPayload);
    // Two written scenes in the first chapter: one break. The empty third scene adds none.
    expect(body.match(/>#</g)).toHaveLength(1);
    const clean = read((await download('?format=clean')).rawPayload).body;
    expect(clean.match(/>\* \* \*</g)).toHaveLength(1);
  });

  it('uses standard manuscript layout, or a clean one', async () => {
    const { story, download, read } = await setup();
    await story();
    const ms = read((await download()).rawPayload).body;
    expect(ms).toContain('w:line="480"'); // double spaced
    expect(ms).toContain('Times New Roman');
    const clean = read((await download('?format=clean')).rawPayload).body;
    expect(clean).not.toContain('w:line="480"');
    expect(clean).toContain('Cambria');
  });

  it('keeps web links and drops unsafe ones', async () => {
    const { story, download, read } = await setup();
    await story();
    const res = await download();
    const files = unzipSync(new Uint8Array(res.rawPayload));
    const rels = strFromU8(files['word/_rels/document.xml.rels']!);
    expect(rels).toContain('https://example.com/x');
    expect(rels).not.toContain('javascript');
    const { body } = read(res.rawPayload);
    expect(body).toContain('Bad link');
  });

  it('honours the paper size', async () => {
    const { story, download, read } = await setup();
    await story();
    expect(read((await download()).rawPayload).body).toContain('w:w="12240"');
    expect(read((await download('?paper=a4')).rawPayload).body).toContain('w:w="11906"');
  });

  it('exports one book, or all of them', async () => {
    const { story, node, write, download, read, api, w } = await setup();
    const { book } = await story();
    const other = await node('book', 'Second Book');
    const ch = await node('chapter', 'Elsewhere', other.id);
    const sc = await node('scene', 'S', ch.id);
    await write(sc.id, doc(para(text('Only in the second book.'))));
    const first = read((await download(`?bookId=${book.id}`)).rawPayload).body;
    expect(first).toContain('The wind rose.');
    expect(first).not.toContain('Only in the second book.');
    const all = read((await download()).rawPayload).body;
    expect(all).toContain('The wind rose.');
    expect(all).toContain('Only in the second book.');
    expect(all).toContain('SECOND BOOK');
    expect((await download(`?bookId=${crypto.randomUUID()}`)).statusCode).toBe(404);
    expect((await api.get(`${w}/export/manuscript.docx?format=pdf`)).statusCode).toBe(400);
  });

  it('says so when there is nothing to export', async () => {
    const { node, download } = await setup();
    const none = await download();
    expect(none.statusCode).toBe(400);
    expect(none.json<{ message: string }>().message).toMatch(/no manuscript/i);
    const book = await node('book', 'Empty book');
    await node('chapter', 'Ch', book.id);
    const textless = await download();
    expect(textless.statusCode).toBe(400);
    expect(textless.json<{ message: string }>().message).toMatch(/no text/i);
  });

  it('uses the signed-in name when no author is given, and survives odd characters', async () => {
    const { node, write, download, read } = await setup();
    const book = await node('book', 'Ünï <Book> & "Co"');
    const ch = await node('chapter', 'A & B', book.id);
    const sc = await node('scene', 'S', ch.id);
    await write(sc.id, doc(para(text('Fish & chips < 5 > 3 "quoted" — done.'))));
    const res = await download();
    expect(res.statusCode, res.body).toBe(200);
    const { body } = read(res.rawPayload);
    expect(body).toContain('Fish &amp; chips &lt; 5 &gt; 3');
    expect(body).toContain('by Test User');
  });

  it('is for editors, and refused to players and previews', async () => {
    const { story, download, player, cookie } = await setup();
    await story();
    expect((await download('', player.api)).statusCode).toBe(403);
    const preview = apiClient(app, cookie, { 'x-view-as': 'player' });
    expect((await download('', preview)).statusCode).toBe(403);
  });

  it('never includes another world’s manuscript', async () => {
    const mine = await setup();
    await mine.story();
    const other = await signUpWithWorld(app, 'Elsewhere');
    const res = await other.api.get(`${other.w}/export/manuscript.docx`);
    expect(res.statusCode).toBe(400);
    expect((await other.api.get(`${mine.w}/export/manuscript.docx`)).statusCode).toBe(404);
  });
});
