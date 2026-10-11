import { inArray, type SQL } from 'drizzle-orm';
import type { PgColumn } from 'drizzle-orm/pg-core';
import { visibilitiesFor, type Audience } from '@atlas/shared';

/**
 * A condition limiting rows to what an audience can see, for a `visibility` column. The GM sees
 * everything, so there is nothing to add: `and()` ignores the undefined.
 */
export function visibleTo(column: PgColumn, audience: Audience): SQL | undefined {
  return audience === 'gm' ? undefined : inArray(column, [...visibilitiesFor(audience)]);
}
