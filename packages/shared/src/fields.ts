import { z } from 'zod';
import type { FieldDefinition } from './schemas/entity-type';

/** How many colours a palette holds. */
export const MAX_PALETTE_COLORS = 12;

/** One thing a character or species can do, with a limited number of uses if it has charges. */
export const abilitySchema = z
  .object({
    name: z.string().trim().min(1, 'Name the ability').max(80),
    description: z.string().trim().max(1000).default(''),
    charges: z
      .object({
        max: z.number().int().min(1).max(99),
        current: z.number().int().min(0).max(99),
        /** When the charges come back, such as "long rest" or "at dawn". */
        recharge: z.string().trim().max(40).default(''),
      })
      .refine((c) => c.current <= c.max, { path: ['current'], message: 'More than the maximum' })
      .nullable()
      .default(null),
  })
  .strict();
export type Ability = z.infer<typeof abilitySchema>;

/** A question and the answer written for it, such as in a character interview. */
export const qaSchema = z
  .object({
    question: z.string().trim().min(1, 'Write the question').max(200),
    answer: z.string().trim().max(2000).default(''),
  })
  .strict();
export type QaPair = z.infer<typeof qaSchema>;

/** The classic character interview, to start a questionnaire from. */
export const CHARACTER_INTERVIEW_QUESTIONS = [
  'What is your earliest memory?',
  'What do you want more than anything?',
  'What are you most afraid of?',
  'What would you never forgive?',
  'Who do you trust, and why?',
  'What is your worst habit?',
  'What would you die for?',
  'What lie do you tell yourself?',
  'What do you do when no one is watching?',
  'What secret would ruin you if it came out?',
  'How do you speak to someone you look down on?',
  'What is the best thing that ever happened to you?',
  'What is the worst thing you have done?',
  'What do you keep in your pockets?',
  'Where do you go when you need to think?',
  'How do you take your tea, or whatever you drink?',
  'What would you change about yourself?',
  'What do other people get wrong about you?',
  'Who taught you the most, and what?',
  'What does home smell like?',
] as const;

const hexColorSchema = z.string().regex(/^#[0-9a-fA-F]{6}$/, 'Use a #rrggbb colour');

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
    case 'palette':
      return z.array(hexColorSchema.transform((c) => c.toLowerCase())).max(MAX_PALETTE_COLORS);
    case 'abilities':
      return z.array(abilitySchema).max(40);
    case 'qa':
      return z.array(qaSchema).max(60);
  }
}

/**
 * A field value in words, for exports, history lists and the arc tracker. Empty values give an
 * empty string. Lists of abilities and questions are written out one per entry.
 */
export function describeFieldValue(value: unknown): string {
  if (value === null || value === undefined || value === '') return '';
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  if (!Array.isArray(value)) return String(value);
  const parts = value.flatMap((item): string[] => {
    if (typeof item === 'string') return [item];
    if (!item || typeof item !== 'object') return [];
    const { name, charges, question, answer } = item as {
      name?: unknown;
      charges?: { max?: unknown } | null;
      question?: unknown;
      answer?: unknown;
    };
    if (typeof name === 'string') {
      return [
        charges && typeof charges.max === 'number' ? `${name} (${charges.max} charges)` : name,
      ];
    }
    if (typeof question === 'string') {
      return [typeof answer === 'string' && answer ? `${question} ${answer}` : question];
    }
    return [];
  });
  const objects = value.some((item) => item && typeof item === 'object');
  return parts.join(objects ? '; ' : ', ');
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
