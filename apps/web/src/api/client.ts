import type { ApiErrorBody } from '@atlas/shared';

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
    public readonly issues: ApiErrorBody['issues'] = [],
  ) {
    super(message);
  }
}

type Method = 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';

/** Calls the API at /api (proxied to Fastify in dev, same origin in production). */
export async function api<T>(method: Method, path: string, body?: unknown): Promise<T> {
  const response = await fetch(`/api${path}`, {
    method,
    credentials: 'same-origin',
    // Only send a JSON content type with a body: Fastify rejects empty JSON bodies.
    headers: body === undefined ? undefined : { 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (response.status === 204) return undefined as T;

  const data = (await response.json().catch(() => null)) as unknown;
  if (!response.ok) {
    const error = data as Partial<ApiErrorBody> | null;
    throw new ApiError(response.status, error?.message ?? response.statusText, error?.issues);
  }
  return data as T;
}

/** A readable message for toasts, including the first field issue if there is one. */
export function errorMessage(error: unknown): string {
  if (error instanceof ApiError) {
    const issue = error.issues?.[0];
    return issue
      ? `${error.message}: ${issue.path ? `${issue.path} — ` : ''}${issue.message}`
      : error.message;
  }
  return error instanceof Error ? error.message : 'Something went wrong';
}

/** Sends a multipart form (file uploads). The browser sets the content type and boundary. */
export async function apiUpload<T>(path: string, form: FormData): Promise<T> {
  const response = await fetch(`/api${path}`, {
    method: 'POST',
    credentials: 'same-origin',
    body: form,
  });
  const data = (await response.json().catch(() => null)) as unknown;
  if (!response.ok) {
    const error = data as Partial<ApiErrorBody> | null;
    throw new ApiError(response.status, error?.message ?? response.statusText, error?.issues);
  }
  return data as T;
}
