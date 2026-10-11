import { Extension } from '@tiptap/react';
import type { Node as PmNode } from '@tiptap/pm/model';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import { Decoration, DecorationSet } from '@tiptap/pm/view';
import type { MentionMatcher } from '@atlas/shared';

interface MentionState {
  matcher: MentionMatcher;
  decorations: DecorationSet;
}

/** Dispatch `tr.setMeta(mentionHighlightKey, matcher)` to (re)highlight with a new matcher. */
export const mentionHighlightKey = new PluginKey<MentionState>('mentionHighlight');

const NO_MATCHER: MentionMatcher = { find: () => [] };

function buildDecorations(doc: PmNode, matcher: MentionMatcher): DecorationSet {
  const decorations: Decoration[] = [];
  doc.descendants((node, pos) => {
    if (!node.isTextblock) return true;
    // Leaf nodes such as hard breaks read as one character, so offsets line up with positions.
    const text = node.textBetween(0, node.content.size, undefined, ' ');
    for (const match of matcher.find(text)) {
      decorations.push(
        Decoration.inline(pos + 1 + match.start, pos + 1 + match.end, {
          class: 'mention',
          'data-entity-id': match.entityId,
        }),
      );
    }
    return false;
  });
  return DecorationSet.create(doc, decorations);
}

/**
 * Underlines entity names and aliases as you write. The matcher lives in plugin state so it
 * can change (new entities, renames) without recreating the editor.
 */
export const MentionHighlight = Extension.create({
  name: 'mentionHighlight',

  addProseMirrorPlugins() {
    return [
      new Plugin<MentionState>({
        key: mentionHighlightKey,
        state: {
          init: () => ({ matcher: NO_MATCHER, decorations: DecorationSet.empty }),
          apply: (tr, previous, _oldState, newState) => {
            const nextMatcher = tr.getMeta(mentionHighlightKey) as MentionMatcher | undefined;
            if (!nextMatcher && !tr.docChanged) return previous;
            const matcher = nextMatcher ?? previous.matcher;
            return { matcher, decorations: buildDecorations(newState.doc, matcher) };
          },
        },
        props: {
          decorations: (state) => mentionHighlightKey.getState(state)?.decorations,
        },
      }),
    ];
  },
});
