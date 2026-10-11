import { z } from 'zod';
import type { FieldDefinition } from './schemas/entity-type';

/** Empty form inputs arrive as '' — store them as "no value". */
const emptyToNull = (value: unknown) => (value === '' ? null : value);

function valueSchemaFor(field: FieldDefinition): z.ZodType {
  switch (field.type) {
    case 'text':
      return z.string().trim().max(2000);
    case 'long_text':
      return z.string().max(20_000);
    case 'number':
      return z.number();
    case 'date':
      // Free text until custom calendars land (e.g. "3rd of Frostfall, 412 AE").
      return z.string().trim().max(100);
    case 'select':
      return field.options?.length ? z.enum(field.options) : z.never();
    case 'multi_select':
      return field.options?.length ? z.array(z.enum(field.options)).max(100) : z.never();
    case 'boolean':
      return z.boolean();
    case 'url':
      // http(s) only, so a stored link can never become a javascript: URL.
      return z.url({ protocol: /^https?$/ });
  }
}

/**
 * Builds the validator for an entity's `fields` object from its type's field schema.
 * Unknown keys (e.g. fields since removed from the type) are stripped.
 */
export function buildFieldValuesSchema(fieldSchema: readonly FieldDefinition[]) {
  const shape: Record<string, z.ZodType> = {};
  for (const field of fieldSchema) {
    shape[field.key] = z.preprocess(emptyToNull, valueSchemaFor(field).nullable().optional());
  }
  return z.object(shape);
}

/** Validates field values and drops empty ones so stored JSON stays tidy. */
export function parseFieldValues(
  fieldSchema: readonly FieldDefinition[],
  values: Record<string, unknown>,
): Record<string, unknown> {
  const parsed = buildFieldValuesSchema(fieldSchema).parse(values);
  return Object.fromEntries(
    Object.entries(parsed).filter(
      ([, value]) =>
        value !== null && value !== undefined && !(Array.isArray(value) && value.length === 0),
    ),
  );
}
