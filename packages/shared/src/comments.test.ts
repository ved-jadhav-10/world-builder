import { describe, expect, it } from 'vitest';
import { groupThreads, openThreadCount } from './comments';
import type { Comment } from './types';

const comment = (id: string, createdAt: string, extra: Partial<Comment> = {}): Comment => ({
  id,
  parentId: null,
  entityId: 'e1',
  nodeId: null,
  author: { id: 'u1', name: 'Ann' },
  body: id,
  resolvedAt: null,
  editedAt: null,
  createdAt,
  ...extra,
});

describe('groupThreads', () => {
  it('puts replies under their thread, oldest first', () => {
    const threads = groupThreads([
      comment('r2', '2026-01-03', { parentId: 'a' }),
      comment('b', '2026-01-02'),
      comment('a', '2026-01-01'),
      comment('r1', '2026-01-02T12:00', { parentId: 'a' }),
    ]);
    expect(threads.map((t) => t.comment.id)).toEqual(['a', 'b']);
    expect(threads[0]!.replies.map((r) => r.id)).toEqual(['r1', 'r2']);
    expect(threads[1]!.replies).toEqual([]);
  });

  it('drops replies whose thread is gone, and handles nothing', () => {
    expect(groupThreads([comment('r', '2026-01-01', { parentId: 'missing' })])).toEqual([]);
    expect(groupThreads([])).toEqual([]);
  });

  it('breaks ties on the same moment by id, so the order is stable', () => {
    const same = '2026-01-01T00:00:00.000Z';
    const threads = groupThreads([comment('b', same), comment('a', same)]);
    expect(threads.map((t) => t.comment.id)).toEqual(['a', 'b']);
  });

  it('does not change the list it is given', () => {
    const list = [comment('b', '2026-01-02'), comment('a', '2026-01-01')];
    groupThreads(list);
    expect(list.map((c) => c.id)).toEqual(['b', 'a']);
  });
});

describe('openThreadCount', () => {
  it('counts threads that are not resolved', () => {
    const threads = groupThreads([
      comment('a', '2026-01-01'),
      comment('b', '2026-01-02', { resolvedAt: '2026-01-03' }),
      comment('c', '2026-01-03'),
    ]);
    expect(openThreadCount(threads)).toBe(2);
  });
});
