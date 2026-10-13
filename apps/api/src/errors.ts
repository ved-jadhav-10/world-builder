import type { FastifyError, FastifyReply, FastifyRequest } from 'fastify';
import { hasZodFastifySchemaValidationErrors } from 'fastify-type-provider-zod';
import { ZodError } from 'zod';
import type { ApiErrorBody } from '@atlas/shared';

export class HttpError extends Error {
  constructor(
    public readonly statusCode: number,
    message: string,
  ) {
    super(message);
  }
}

export const badRequest = (message: string) => new HttpError(400, message);
export const unauthorized = () => new HttpError(401, 'Sign in to continue');
export const forbidden = (message = 'You do not have permission to do that') =>
  new HttpError(403, message);
export const notFound = (what = 'Resource') => new HttpError(404, `${what} not found`);
export const conflict = (message: string) => new HttpError(409, message);
export const gone = (message: string) => new HttpError(410, message);

const STATUS_NAMES: Record<number, string> = {
  400: 'Bad Request',
  401: 'Unauthorized',
  403: 'Forbidden',
  404: 'Not Found',
  409: 'Conflict',
  410: 'Gone',
  413: 'Payload Too Large',
  500: 'Internal Server Error',
};

function body(statusCode: number, message: string, issues?: ApiErrorBody['issues']): ApiErrorBody {
  return { error: STATUS_NAMES[statusCode] ?? 'Error', message, ...(issues ? { issues } : {}) };
}

/** Postgres error codes surfaced by postgres.js, possibly wrapped by Drizzle. */
function pgErrorCode(error: unknown): string | undefined {
  const candidates = [error, (error as { cause?: unknown })?.cause];
  for (const candidate of candidates) {
    const code = (candidate as { code?: unknown })?.code;
    if (typeof code === 'string' && /^[0-9A-Z]{5}$/.test(code)) return code;
  }
  return undefined;
}

export function errorHandler(error: FastifyError, request: FastifyRequest, reply: FastifyReply) {
  if (hasZodFastifySchemaValidationErrors(error)) {
    const issues = error.validation.map((v) => ({
      path: v.instancePath.split('/').filter(Boolean).join('.'),
      message: v.message ?? 'Invalid value',
    }));
    return reply.status(400).send(body(400, 'Some fields are invalid', issues));
  }
  if (error instanceof ZodError) {
    const issues = error.issues.map((i) => ({ path: i.path.join('.'), message: i.message }));
    return reply.status(400).send(body(400, 'Some fields are invalid', issues));
  }
  if (error instanceof HttpError) {
    return reply.status(error.statusCode).send(body(error.statusCode, error.message));
  }
  const pgCode = pgErrorCode(error);
  if (pgCode === '23505') {
    return reply.status(409).send(body(409, 'That name is already taken'));
  }
  if (pgCode === '23503') {
    return reply.status(409).send(body(409, 'This item is still in use'));
  }
  if (error.statusCode && error.statusCode < 500) {
    return reply.status(error.statusCode).send(body(error.statusCode, error.message));
  }
  request.log.error(error);
  return reply.status(500).send(body(500, 'Something went wrong'));
}
