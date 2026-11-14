import { z } from 'zod';
import { buildSceneIndex, type SceneIndex, type StoryPoint } from './progressions';
import type { ManuscriptNode } from './types';

/*
 * The reader wiki: a public, read-only face of a world that never spoils the book. A reader says
 * how far they have read ("up to chapter 7"), and the wiki shows each entry as it stood at the
 * end of that chapter: entries first met later are absent, and names, details and links that
 * change later still show their earlier state. The rules here are pure, so the API and its tests
 * share them.
 */

/** How far a reader has read: a chapter's id, `start` (nothing yet) or `end` (all of it). */
export const READER_START = 'start';
export const READER_END = 'end';

export const wikiProgressSchema = z
  .union([z.literal(READER_START), z.literal(READER_END), z.uuid()])
  .default(READER_START);
export type WikiProgress = z.infer<typeof wikiProgressSchema>;

export const wikiSettingsSchema = z.object({
  enabled: z.boolean().optional(),
  /** A short welcome shown at the top of the wiki. */
  intro: z.string().trim().max(2000).optional(),
  /** Show chapter titles in the progress picker; off shows only "Chapter 7" (titles can spoil). */
  showChapterTitles: z.boolean().optional(),
  /** A new password; an empty string removes it; leave out to keep the current one. */
  password: z.string().max(200).optional(),
});
export type WikiSettingsInput = z.infer<typeof wikiSettingsSchema>;

export const wikiUnlockSchema = z.object({ password: z.string().min(1).max(200) });

export interface WikiSettings {
  enabled: boolean;
  intro: string;
  showChapterTitles: boolean;
  hasPassword: boolean;
  /** False when the server has public wikis switched off altogether. */
  available: boolean;
}

/** A chapter as the reader picks it: its place in the book and the scenes it covers. */
export interface WikiChapter {
  id: string;
  /** 1 for the first chapter of the manuscript, counting across parts and books. */
  number: number;
  title: string;
  /** Reading-order index of its first and last scene; null for a chapter with no scenes yet. */
  firstScene: number | null;
  lastScene: number | null;
}

/** Chapters in reading order, each with the span of scenes under it. */
export function wikiChapters(nodes: readonly ManuscriptNode[]): WikiChapter[] {
  const scenes = buildSceneIndex(nodes);
  const children = new Map<string | null, ManuscriptNode[]>();
  for (const node of nodes) {
    children.set(node.parentId, [...(children.get(node.parentId) ?? []), node]);
  }
  for (const list of children.values()) list.sort((a, b) => a.sortOrder - b.sortOrder);

  const span = (nodeId: string): [number, number] | null => {
    let first: number | null = null;
    let last: number | null = null;
    const visit = (id: string) => {
      for (const child of children.get(id) ?? []) {
        if (child.kind === 'scene') {
          const index = scenes.get(child.id)?.index;
          if (index === undefined) continue;
          first = first === null ? index : Math.min(first, index);
          last = last === null ? index : Math.max(last, index);
        } else {
          visit(child.id);
        }
      }
    };
    visit(nodeId);
    return first === null || last === null ? null : [first, last];
  };

  const chapters: WikiChapter[] = [];
  const walk = (parentId: string | null) => {
    for (const node of children.get(parentId) ?? []) {
      if (node.kind === 'chapter') {
        const range = span(node.id);
        chapters.push({
          id: node.id,
          number: chapters.length + 1,
          title: node.title,
          firstScene: range ? range[0] : null,
          lastScene: range ? range[1] : null,
        });
      } else if (node.kind !== 'scene') {
        walk(node.id);
      }
    }
  };
  walk(null);
  return chapters;
}

/** Where a reader stands, for the "as of" rules. `null` means the end: nothing is held back. */
export interface ReaderPoint {
  /** Index (from 0) of the last chapter read; -1 before the first. */
  chapterIndex: number;
  /** Index of the last scene read; -1 before the first. */
  sceneIndex: number;
  /** The latest in-world day among the scenes read, when any has one. */
  day: number | null;
}

/**
 * Turns a reader's stated progress into a point in reading order. An unknown chapter (deleted
 * since the link was made) is treated as the start: the safe side of a spoiler.
 */
export function readerPoint(
  progress: WikiProgress,
  chapters: readonly WikiChapter[],
  scenes: SceneIndex,
): ReaderPoint | null {
  if (progress === READER_END) return null;
  const start: ReaderPoint = { chapterIndex: -1, sceneIndex: -1, day: null };
  if (progress === READER_START) return start;
  const at = chapters.findIndex((chapter) => chapter.id === progress);
  if (at < 0) return start;
  // A chapter with no scenes takes the reader as far as the last chapter before it that has some.
  let sceneIndex = -1;
  for (let i = at; i >= 0; i--) {
    const last = chapters[i]!.lastScene;
    if (last !== null) {
      sceneIndex = last;
      break;
    }
  }
  let day: number | null = null;
  for (const scene of scenes.values()) {
    if (scene.index <= sceneIndex && scene.day !== null) {
      day = day === null ? scene.day : Math.max(day, scene.day);
    }
  }
  return { chapterIndex: at, sceneIndex, day };
}

/** The reader's point in the shape the progression rules use. */
export function toStoryPoint(point: ReaderPoint): StoryPoint {
  return { sceneIndex: point.sceneIndex, day: point.day };
}

/**
 * Has the reader reached the place an entry is held back until? `revealNodeId` is a chapter (the
 * entry appears once that chapter has been read) or a scene; an entry with none is never held
 * back. A node that no longer exists hides the entry until the end, again the safe side.
 */
export function isRevealedToReader(
  revealNodeId: string | null,
  point: ReaderPoint | null,
  chapters: readonly WikiChapter[],
  scenes: SceneIndex,
): boolean {
  if (revealNodeId === null || point === null) return true;
  const scene = scenes.get(revealNodeId);
  if (scene) return scene.index <= point.sceneIndex;
  const at = chapters.findIndex((chapter) => chapter.id === revealNodeId);
  return at >= 0 && at <= point.chapterIndex;
}

/** How a chapter is named in the picker. */
export function chapterLabel(chapter: WikiChapter, showTitle: boolean): string {
  const title = chapter.title.trim();
  return showTitle && title && !/^chapter\s+\d+$/i.test(title)
    ? `Chapter ${chapter.number}: ${title}`
    : `Chapter ${chapter.number}`;
}

/* What the wiki's public endpoints send. Nothing here names a scene or shows the manuscript. */

export interface WikiEntryCard {
  id: string;
  typeKey: string;
  name: string;
  aliases: string[];
  summary: string;
}

export interface WikiType {
  key: string;
  name: string;
  icon: string;
  color: string;
  count: number;
}

export interface WikiHome {
  world: { name: string; slug: string; description: string; intro: string };
  /** The chapters a reader can say they have reached, already labelled. */
  chapters: { id: string; label: string }[];
  /** The progress the answer was worked out for (an unknown chapter falls back to the start). */
  progress: WikiProgress;
  types: WikiType[];
  entries: WikiEntryCard[];
}

export interface WikiEntry extends WikiEntryCard {
  type: Omit<WikiType, 'count'>;
  /** Field values in words, in the type's order; empty ones are left out. */
  fields: { key: string; label: string; text: string }[];
  /** The article, with the author's secret blocks removed. */
  body: unknown;
  links: { label: string; notes: string; other: { id: string; name: string } }[];
  images: { id: string; caption: string; width: number; height: number; isPortrait: boolean }[];
}

/** Sent with a 401 when the wiki is behind a password the visitor has not given yet. */
export interface WikiLocked {
  locked: true;
  world: { name: string };
}
