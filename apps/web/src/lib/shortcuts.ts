/*
 * Keyboard shortcuts for moving around a world. Pressing "g" and then a letter goes to a page,
 * the way many web apps do, so the keys never clash with typing.
 */

export interface ShortcutContext {
  /** The world's address, such as /w/aerth. */
  base: string;
  /** Can see the GM-only pages (manuscript, writing goals, plot boards). */
  isGm: boolean;
  /** Can edit the world's settings. */
  canEdit: boolean;
}

interface GoShortcut {
  key: string;
  label: string;
  path: string;
  /** Needs the GM view or edit rights. */
  needs?: 'gm' | 'edit';
}

export const GO_SHORTCUTS: readonly GoShortcut[] = [
  { key: 'c', label: 'Codex', path: '' },
  { key: 'o', label: 'Content tree', path: '/tree' },
  { key: 'a', label: 'Atlas', path: '/atlas' },
  { key: 't', label: 'Timeline', path: '/timeline' },
  { key: 'g', label: 'Relationship graph', path: '/graph' },
  { key: 'd', label: 'Diplomacy', path: '/diplomacy' },
  { key: 'q', label: 'Quests', path: '/quests' },
  { key: 'm', label: 'Manuscript', path: '/manuscript', needs: 'gm' },
  { key: 'w', label: 'Writing goals', path: '/writing', needs: 'gm' },
  { key: 'p', label: 'Plot boards', path: '/plot', needs: 'gm' },
  { key: 'r', label: 'Arc tracker', path: '/arcs', needs: 'gm' },
  { key: 'k', label: 'To-do list', path: '/todos', needs: 'gm' },
  { key: 'l', label: 'Gallery', path: '/gallery' },
  { key: 's', label: 'World settings', path: '/settings', needs: 'edit' },
];

/** Other keys, for the help list. */
export const OTHER_SHORTCUTS: readonly { keys: string[]; label: string }[] = [
  { keys: ['Ctrl', 'K'], label: 'Search the world' },
  { keys: ['/'], label: 'Search the world' },
  { keys: ['?'], label: 'Show these shortcuts' },
  { keys: ['Ctrl', 'S'], label: 'Save the entry or scene you are editing' },
];

/** Where "g" then `key` goes, or null if that key goes nowhere (or is not allowed here). */
export function resolveGo(key: string, ctx: ShortcutContext): string | null {
  const found = GO_SHORTCUTS.find((s) => s.key === key.toLowerCase());
  if (!found) return null;
  if (found.needs === 'gm' && !ctx.isGm) return null;
  if (found.needs === 'edit' && !ctx.canEdit) return null;
  return `${ctx.base}${found.path}`;
}

/** The shortcuts this person can use, for the help list. */
export function availableGo(ctx: Pick<ShortcutContext, 'isGm' | 'canEdit'>) {
  return GO_SHORTCUTS.filter(
    (s) => !s.needs || (s.needs === 'gm' && ctx.isGm) || (s.needs === 'edit' && ctx.canEdit),
  );
}

/** Keys pressed while typing in a field, a menu or a dialog are not shortcuts. */
export function isTypingTarget(target: EventTarget | null): boolean {
  const element = target as { closest?: (selector: string) => unknown } | null;
  if (!element || typeof element.closest !== 'function') return false;
  return Boolean(
    element.closest('input, textarea, select, [contenteditable="true"], [role="dialog"]'),
  );
}
