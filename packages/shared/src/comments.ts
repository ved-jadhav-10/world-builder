import type { Comment, CommentThread } from './types';

/**
 * Turns a flat list of comments into threads: each comment that answers nothing, oldest first,
 * with its replies in the order they were written. A reply whose thread is missing is dropped.
 */
export function groupThreads(comments: readonly Comment[]): CommentThread[] {
  const byTime = (a: Comment, b: Comment) =>
    a.createdAt < b.createdAt ? -1 : a.createdAt > b.createdAt ? 1 : a.id < b.id ? -1 : 1;
  const sorted = [...comments].sort(byTime);
  const threads = new Map<string, CommentThread>();
  for (const comment of sorted) {
    if (comment.parentId === null) threads.set(comment.id, { comment, replies: [] });
  }
  for (const comment of sorted) {
    if (comment.parentId !== null) threads.get(comment.parentId)?.replies.push(comment);
  }
  return [...threads.values()];
}

/** How many threads still need an answer. */
export const openThreadCount = (threads: readonly CommentThread[]): number =>
  threads.filter((t) => t.comment.resolvedAt === null).length;
