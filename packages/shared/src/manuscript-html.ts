import type { ManuscriptBlock, TextRun } from './manuscript-text';

/** Escapes text for XML and HTML, in element content and in quoted attributes alike. */
export function escapeXml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function runHtml(run: TextRun): string {
  if (run.lineBreak) return '<br />';
  let html = escapeXml(run.text);
  if (run.code) html = `<code>${html}</code>`;
  if (run.bold) html = `<strong>${html}</strong>`;
  if (run.italic) html = `<em>${html}</em>`;
  if (run.underline) html = `<u>${html}</u>`;
  if (run.strike) html = `<s>${html}</s>`;
  if (run.link) html = `<a href="${escapeXml(run.link)}">${html}</a>`;
  return html;
}

const runsHtml = (runs: TextRun[]) => runs.map(runHtml).join('');

const NEWLINE = '\n';

/**
 * The blocks of a scene as XHTML (well-formed XML, which an EPUB reader requires). Consecutive
 * list items are gathered into nested lists by their depth: a deeper item opens a list inside
 * the item before it, and a shallower one closes the lists it has left.
 */
export function blocksToXhtml(blocks: readonly ManuscriptBlock[]): string {
  const out: string[] = [];
  // The lists open at the moment, outermost first.
  const open: ('ul' | 'ol')[] = [];
  const closeLists = (down: number) => {
    while (open.length > down) {
      out.push(`</li></${open.pop()}>`);
      if (open.length === 0) out.push(NEWLINE);
    }
  };
  const line = (html: string) => out.push(html, NEWLINE);

  for (const block of blocks) {
    if (block.kind !== 'list') closeLists(0);
    switch (block.kind) {
      case 'paragraph':
        line(`<p>${runsHtml(block.runs)}</p>`);
        break;
      case 'heading':
        // Chapter titles are h1 and h2, so a heading inside a scene starts at h3.
        line(`<h${block.level + 2}>${runsHtml(block.runs)}</h${block.level + 2}>`);
        break;
      case 'quote':
        line(`<blockquote><p>${runsHtml(block.runs)}</p></blockquote>`);
        break;
      case 'code':
        line(`<pre>${escapeXml(block.text)}</pre>`);
        break;
      case 'rule':
        line('<hr />');
        break;
      case 'list': {
        const tag = block.ordered ? 'ol' : 'ul';
        const depth = Math.min(block.depth, 2);
        closeLists(depth + 1);
        if (open.length === depth + 1) {
          if (open[depth] === tag) {
            // The next item of the same list.
            out.push('</li><li>');
          } else {
            // The kind of list changed at this level: close the old one and start a new one.
            closeLists(depth);
            out.push(`<${tag}><li>`);
            open.push(tag);
          }
        } else {
          // Starting, or going deeper: open lists down to this depth.
          while (open.length < depth + 1) {
            out.push(`<${tag}><li>`);
            open.push(tag);
          }
        }
        out.push(runsHtml(block.runs));
        break;
      }
    }
  }
  closeLists(0);
  return out.join('').trimEnd();
}
