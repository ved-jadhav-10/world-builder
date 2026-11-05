import { z } from 'zod';

/** A finding's key: the rule, then the ids and a hash that identify it. Never user-supplied text. */
export const continuityKeySchema = z
  .string()
  .min(3)
  .max(200)
  .regex(/^[a-z_]+:[A-Za-z0-9:_-]+$/, 'That is not a finding key');

export const continuityDismissSchema = z.object({ key: continuityKeySchema });
export const continuityRestoreQuerySchema = z.object({ key: continuityKeySchema });
