import { z } from 'zod';
import { visibilitySchema } from './common';

/** Sessions are entries of the built-in "session" type; their fields say where they stand. */
export const SESSION_TYPE_KEY = 'session';
export const SESSION_NUMBER_FIELD = 'number';
export const SESSION_STATUS_FIELD = 'status';
export const SESSION_PLAYED_ON_FIELD = 'played_on';
export const SESSION_STATUSES = ['Planned', 'Played'] as const;
export type SessionStatus = (typeof SESSION_STATUSES)[number];
/** The relationship that ties a session to what was in it: "Session 4 features Mira". */
export const SESSION_LINK_KEY = 'featured';

export const sessionCreateSchema = z.object({
  /** Left out, the session is called "Session N" after its number. */
  name: z.string().trim().min(1).max(200).optional(),
  visibility: visibilitySchema.default('gm'),
});
export type SessionCreateInput = z.input<typeof sessionCreateSchema>;
