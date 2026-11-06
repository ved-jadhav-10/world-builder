/*
 * Secret blocks: parts of an article only the GM sees. The editor wraps them in a `secretBlock`
 * node; anyone else is sent the article without those nodes, and they are left out of its
 * search text, so neither the text nor the words in it can be found by a player.
 */

export const SECRET_BLOCK_NODE = 'secretBlock';

interface DocNode {
  type?: string;
  content?: unknown[];
  [key: string]: unknown;
}

const isNode = (value: unknown): value is DocNode => Boolean(value) && typeof value === 'object';

/** Does the document hold any secret block? */
export function hasSecretBlocks(doc: unknown): boolean {
  if (!isNode(doc)) return false;
  if (doc.type === SECRET_BLOCK_NODE) return true;
  return Array.isArray(doc.content) && doc.content.some(hasSecretBlocks);
}

/**
 * The document without its secret blocks, however deeply they are nested. A new object is
 * returned only when something was removed. An article that was only secret becomes null.
 */
export function stripSecretBlocks<T>(doc: T): T {
  if (!isNode(doc) || !hasSecretBlocks(doc)) return doc;
  const strip = (node: DocNode): DocNode => {
    if (!Array.isArray(node.content)) return node;
    const content = node.content
      .filter((child) => !(isNode(child) && child.type === SECRET_BLOCK_NODE))
      .map((child) => (isNode(child) ? strip(child) : child));
    return { ...node, content };
  };
  const stripped = strip(doc);
  const empty = !stripped.content || stripped.content.length === 0;
  return (empty ? null : stripped) as T;
}
