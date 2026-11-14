/** True when a stored article (TipTap/ProseMirror JSON) has any text to show. */
export function hasRichText(doc: unknown): boolean {
  interface Node {
    text?: string;
    content?: Node[];
  }
  const walk = (node: Node): boolean =>
    Boolean(node.text?.trim()) || (node.content ?? []).some(walk);
  return Boolean(doc && typeof doc === 'object' && walk(doc as Node));
}
