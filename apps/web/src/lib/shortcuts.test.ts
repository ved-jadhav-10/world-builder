import { describe, expect, it } from 'vitest';
import { availableGo, isTypingTarget, resolveGo } from './shortcuts';

const gm = { base: '/w/aerth', isGm: true, canEdit: true };
const player = { base: '/w/aerth', isGm: false, canEdit: false };

describe('go shortcuts', () => {
  it('goes to a page in the world', () => {
    expect(resolveGo('c', gm)).toBe('/w/aerth');
    expect(resolveGo('A', gm)).toBe('/w/aerth/atlas');
    expect(resolveGo('o', player)).toBe('/w/aerth/tree');
  });
  it('keeps GM pages to the GM and settings to editors', () => {
    expect(resolveGo('m', gm)).toBe('/w/aerth/manuscript');
    expect(resolveGo('m', player)).toBeNull();
    expect(resolveGo('s', player)).toBeNull();
    expect(resolveGo('s', { ...player, canEdit: true })).toBe('/w/aerth/settings');
  });
  it('ignores keys that go nowhere', () => {
    expect(resolveGo('z', gm)).toBeNull();
  });
  it('gives each shortcut its own key', () => {
    const keys = availableGo(gm).map((s) => s.key);
    expect(new Set(keys).size).toBe(keys.length);
    expect(availableGo(player).every((s) => !s.needs)).toBe(true);
  });
});

describe('isTypingTarget', () => {
  const inside = { closest: () => ({}) } as unknown as EventTarget;
  const outside = { closest: () => null } as unknown as EventTarget;
  it('is true inside fields, editors and dialogs, false elsewhere', () => {
    expect(isTypingTarget(inside)).toBe(true);
    expect(isTypingTarget(outside)).toBe(false);
    expect(isTypingTarget(null)).toBe(false);
    expect(isTypingTarget({} as EventTarget)).toBe(false);
  });
});
