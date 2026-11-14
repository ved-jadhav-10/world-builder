import { Fragment, type ReactNode } from 'react';

/*
 * A read-only renderer for an article's stored document (TipTap/ProseMirror JSON). It draws the
 * plain parts of an article with no editor behind it, so public pages stay light and never load
 * the writing tools. Things that need the app around them (embedded maps and timelines, secret
 * blocks) are simply left out.
 */

interface Mark {
  type: string;
  attrs?: Record<string, unknown>;
}
interface Node {
  type?: string;
  text?: string;
  content?: Node[];
  marks?: Mark[];
  attrs?: Record<string, unknown>;
}

/** Only web and mail addresses are turned into links; anything else stays as text. */
function safeHref(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  return /^(https?:|mailto:)/i.test(value.trim()) ? value.trim() : null;
}

function withMarks(text: string, marks: Mark[] | undefined, key: number): ReactNode {
  let out: ReactNode = text;
  for (const mark of marks ?? []) {
    if (mark.type === 'bold') out = <strong>{out}</strong>;
    else if (mark.type === 'italic') out = <em>{out}</em>;
    else if (mark.type === 'strike') out = <s>{out}</s>;
    else if (mark.type === 'underline') out = <u>{out}</u>;
    else if (mark.type === 'code') out = <code>{out}</code>;
    else if (mark.type === 'link') {
      const href = safeHref(mark.attrs?.href);
      if (href)
        out = (
          <a href={href} target="_blank" rel="noopener noreferrer nofollow">
            {out}
          </a>
        );
    }
  }
  return <Fragment key={key}>{out}</Fragment>;
}

function children(node: Node): ReactNode {
  return (node.content ?? []).map((child, index) => render(child, index));
}

function render(node: Node, key: number): ReactNode {
  switch (node.type) {
    case 'text':
      return withMarks(node.text ?? '', node.marks, key);
    case 'paragraph':
      return <p key={key}>{children(node)}</p>;
    case 'heading':
      return node.attrs?.level === 3 ? (
        <h3 key={key}>{children(node)}</h3>
      ) : (
        <h2 key={key}>{children(node)}</h2>
      );
    case 'bulletList':
      return <ul key={key}>{children(node)}</ul>;
    case 'orderedList':
      return <ol key={key}>{children(node)}</ol>;
    case 'listItem':
      return <li key={key}>{children(node)}</li>;
    case 'blockquote':
      return <blockquote key={key}>{children(node)}</blockquote>;
    case 'codeBlock':
      return (
        <pre key={key}>
          <code>{children(node)}</code>
        </pre>
      );
    case 'hardBreak':
      return <br key={key} />;
    case 'horizontalRule':
      return <hr key={key} />;
    default:
      return null;
  }
}

export function RichTextView({ doc, className }: { doc: unknown; className?: string }) {
  if (!doc || typeof doc !== 'object') return null;
  return <div className={className}>{children(doc as Node)}</div>;
}
