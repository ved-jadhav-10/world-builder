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

/** Throws unless every tag in the XML is closed in order; enough to catch broken markup. */
function assertWellFormed(name: string, xml: string) {
  const stack: string[] = [];
  const body = xml.replace(/<\?[\s\S]*?\?>/g, '').replace(/<!DOCTYPE[^>]*>/gi, '');
  for (const match of body.matchAll(
    /<(\/?)([A-Za-z][\w:.-]*)((?:"[^"]*"|'[^']*'|[^>"'])*?)(\/?)>/g,
  )) {
    const [, closing, tag, , selfClosing] = match;
    if (selfClosing) continue;
    if (closing) {
      const open = stack.pop();
      if (open !== tag) throw new Error(`${name}: </${tag}> closes <${open}>`);
    } else {
      stack.push(tag!);
    }
  }
  if (stack.length > 0) throw new Error(`${name}: unclosed <${stack.join('>, <')}>`);
  // Bare ampersands and angle brackets in text are the usual mistake.
  const textOnly = body.replace(/<[^>]*>/g, '');
  if (/&(?!amp;|lt;|gt;|quot;|#39;)/.test(textOnly)) throw new Error(`${name}: unescaped &`);
  if (/[<>]/.test(textOnly)) throw new Error(`${name}: stray angle bracket in text`);
}

async function setup() {
  const ctx = await signUpWithWorld(app);
  const { api, w } = ctx;
  const player = await joinWorld(app, ctx.world.id, 'player');
  const node = async (kind: string, title: string, parentId?: string) =>
    (await api.post(`${w}/manuscript/nodes`, { kind, title, parentId })).json<ManuscriptNode>();
  const write = (id: string, body: RichTextDoc) =>
    api.put(`${w}/manuscript/scenes/${id}/body`, { body });
  const download = (query = '', client = api) => client.get(`${w}/export/manuscript.epub${query}`);
  const open = (payload: Buffer) => {
    const files = unzipSync(new Uint8Array(payload));
    const part = (n: string) => (files[n] ? strFromU8(files[n]!) : '');
    return { files, part, names: Object.keys(files) };
  };
  const story = async () => {
    const book = await node('book', 'The Salt Road');
    const part = await node('part', 'Part One', book.id);
    const one = await node('chapter', 'The Docks', part.id);
    const two = await node('chapter', 'The Storm & After', part.id);
    const a = await node('scene', 'A', one.id);
    const b = await node('scene', 'B', one.id);
    const c = await node('scene', 'C', two.id);
    await write(
      a.id,
      doc(para(text('Mira reached the '), text('docks', [{ type: 'bold' }]), text(' at dawn.'))),
    );
    await write(
      b.id,
      doc(
        para(text('Second <scene> & more.')),
        para(text('Link', [{ type: 'link', attrs: { href: 'https://example.com/?a=1&b=2' } }])),
      ),
    );
    await write(c.id, doc(para(text('The wind rose.'))));
    return { book, part };
  };
  return { ...ctx, player, node, write, download, open, story };
}

describe('manuscript export as EPUB', () => {
  it('makes a valid-looking EPUB: mimetype first and stored, container, package, navigation', async () => {
    const { story, download, open } = await setup();
    await story();
    const res = await download('?author=Mira%20Vey');
    expect(res.statusCode, res.body).toBe(200);
    expect(res.headers['content-type']).toBe('application/epub+zip');
    expect(String(res.headers['content-disposition'])).toContain('The%20Salt%20Road.epub');
    const { files, part, names } = open(res.rawPayload);
    // The mimetype entry is first, and holds exactly the type, uncompressed.
    expect(names[0]).toBe('mimetype');
    expect(part('mimetype')).toBe('application/epub+zip');
    const raw = res.rawPayload.subarray(0, 120).toString('latin1');
    expect(raw).toContain('mimetypeapplication/epub+zip');
    expect(part('META-INF/container.xml')).toContain('OEBPS/content.opf');
    const opf = part('OEBPS/content.opf');
    expect(opf).toContain('<dc:title>The Salt Road</dc:title>');
    expect(opf).toContain('<dc:creator>Mira Vey</dc:creator>');
    expect(opf).toContain('<dc:language>en</dc:language>');
    expect(opf).toMatch(/<meta property="dcterms:modified">\d{4}-\d{2}-\d{2}T[\d:]+Z<\/meta>/);
    expect(opf).toMatch(/<dc:identifier id="book-id">urn:uuid:[0-9a-f-]{36}<\/dc:identifier>/);
    // Everything in the spine and manifest exists.
    for (const href of opf.matchAll(/href="([^"]+)"/g)) {
      expect(files[`OEBPS/${href[1]}`], href[1]).toBeDefined();
    }
    const nav = part('OEBPS/nav.xhtml');
    expect(nav).toContain('epub:type="toc"');
    for (const title of ['Part One', 'The Docks', 'The Storm &amp; After']) {
      expect(nav).toContain(title);
    }
  });

  it('writes each chapter as its own page with formatting, scene breaks and escaping', async () => {
    const { story, download, open } = await setup();
    await story();
    const { part, names } = open((await download()).rawPayload);
    const chapters = names.filter((n) => /OEBPS\/chapter-\d+\.xhtml/.test(n)).sort();
    expect(chapters).toHaveLength(2);
    const first = part(chapters[0]!);
    expect(first).toContain('<h2>The Docks</h2>');
    expect(first).toContain('<strong>docks</strong>');
    expect(first).toContain('Second &lt;scene&gt; &amp; more.');
    expect(first).toContain('<a href="https://example.com/?a=1&amp;b=2">Link</a>');
    expect(first.match(/<p class="break">\* \* \*<\/p>/g)).toHaveLength(1);
    expect(part(chapters[1]!)).toContain('<h2>The Storm &amp; After</h2>');
    expect(part(chapters[1]!)).not.toContain('class="break"');
  });

  it('is well-formed XML in every file', async () => {
    const { story, download, open } = await setup();
    await story();
    const { names, part } = open((await download()).rawPayload);
    for (const name of names) {
      if (/\.(xhtml|opf|xml)$/.test(name)) assertWellFormed(name, part(name));
    }
  });

  it('exports one book, or all of them with a page for each book title', async () => {
    const { story, node, write, download, open } = await setup();
    const { book } = await story();
    const other = await node('book', 'Second Book');
    const ch = await node('chapter', 'Elsewhere', other.id);
    const sc = await node('scene', 'S', ch.id);
    await write(sc.id, doc(para(text('Only in the second book.'))));
    const all = (res: Buffer) => {
      const { names, part } = open(res);
      return names.map((n) => part(n)).join('\n');
    };
    const one = all((await download(`?bookId=${book.id}`)).rawPayload);
    expect(one).toContain('The wind rose.');
    expect(one).not.toContain('Only in the second book.');
    const both = all((await download()).rawPayload);
    expect(both).toContain('Only in the second book.');
    expect(both).toContain('<h1>Second Book</h1>');
    expect((await download(`?bookId=${crypto.randomUUID()}`)).statusCode).toBe(404);
  });

  it('says so when there is nothing to export, and uses the signed-in name by default', async () => {
    const { node, write, download, open } = await setup();
    expect((await download()).statusCode).toBe(400);
    const book = await node('book', 'Ünï <Book>');
    const ch = await node('chapter', 'Ch', book.id);
    const sc = await node('scene', 'S', ch.id);
    expect((await download()).json<{ message: string }>().message).toMatch(/no text/i);
    await write(sc.id, doc(para(text('Words.'))));
    const res = await download();
    expect(res.statusCode, res.body).toBe(200);
    const opf = open(res.rawPayload).part('OEBPS/content.opf');
    expect(opf).toContain('<dc:title>Ünï &lt;Book&gt;</dc:title>');
    expect(opf).toContain('<dc:creator>Test User</dc:creator>');
  });

  it('is for editors, never leaks another world, and is refused in a preview', async () => {
    const { story, download, player, cookie, w } = await setup();
    await story();
    expect((await download('', player.api)).statusCode).toBe(403);
    expect((await download('', apiClient(app, cookie, { 'x-view-as': 'player' }))).statusCode).toBe(
      403,
    );
    const other = await signUpWithWorld(app, 'Elsewhere');
    expect((await other.api.get(`${other.w}/export/manuscript.epub`)).statusCode).toBe(400);
    expect((await other.api.get(`${w}/export/manuscript.epub`)).statusCode).toBe(404);
  });
});
