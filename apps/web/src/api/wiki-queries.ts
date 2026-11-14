import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  WikiEntry,
  WikiHome,
  WikiProgress,
  WikiSettings,
  WikiSettingsInput,
} from '@atlas/shared';
import { api, ApiError } from '@/api/client';

/** The wiki's front page also says where to report a page, when the server has an address. */
export type WikiHomeData = WikiHome & { reportTo: string | null };

/** Thrown when a wiki is behind a password the visitor has not given yet. */
export class WikiLockedError extends Error {
  constructor(public readonly worldName: string) {
    super('This wiki needs a password');
  }
}

/** The wiki is public, so it is read with a plain fetch: no "view as" header, no session needed. */
async function wikiGet<T>(path: string): Promise<T> {
  const response = await fetch(`/api/wiki/${path}`, { credentials: 'same-origin' });
  const data = (await response.json().catch(() => null)) as unknown;
  if (response.status === 401 && data && (data as { locked?: boolean }).locked) {
    throw new WikiLockedError((data as { world: { name: string } }).world.name);
  }
  if (!response.ok) {
    throw new ApiError(
      response.status,
      (data as { message?: string } | null)?.message ?? response.statusText,
    );
  }
  return data as T;
}

const retry = (count: number, error: unknown) =>
  !(error instanceof WikiLockedError) &&
  !(error instanceof ApiError && error.status < 500) &&
  count < 2;

export function useWikiHome(slug: string, chapter: WikiProgress) {
  return useQuery({
    queryKey: ['wiki', slug, 'home', chapter],
    queryFn: () => wikiGet<WikiHomeData>(`${slug}?chapter=${encodeURIComponent(chapter)}`),
    retry,
    placeholderData: (previous) => previous,
  });
}

export function useWikiEntry(slug: string, entryId: string, chapter: WikiProgress) {
  return useQuery({
    queryKey: ['wiki', slug, 'entry', entryId, chapter],
    queryFn: () =>
      wikiGet<WikiEntry>(`${slug}/entries/${entryId}?chapter=${encodeURIComponent(chapter)}`),
    retry,
  });
}

export function useWikiUnlock(slug: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (password: string) =>
      api<{ ok: true }>('POST', `/wiki/${slug}/unlock`, { password }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['wiki', slug] }),
  });
}

export const wikiImageUrl = (slug: string, imageId: string, which: 'file' | 'thumbnail') =>
  `/api/wiki/${slug}/images/${imageId}/${which}`;

/* Settings, inside the app. */

const settingsKey = (worldId: string) => ['wiki-settings', worldId];

export function useWikiSettings(worldId: string) {
  return useQuery({
    queryKey: settingsKey(worldId),
    queryFn: () => api<WikiSettings>('GET', `/worlds/${worldId}/wiki-settings`),
  });
}

export function useUpdateWikiSettings(worldId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: WikiSettingsInput) =>
      api<WikiSettings>('PATCH', `/worlds/${worldId}/wiki-settings`, input),
    onSuccess: (settings) => qc.setQueryData(settingsKey(worldId), settings),
  });
}
