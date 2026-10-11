import { z } from 'zod';
import { colorSchema, iconSchema } from './common';

export const FIELD_TYPES = [
  'text',
  'long_text',
  'number',
  'date',
  'select',
  'multi_select',
  'boolean',
  'url',
] as const;
export type FieldType = (typeof FIELD_TYPES)[number];

export const FIELD_TYPE_LABELS: Record<FieldType, string> = {
  text: 'Short text',
  long_text: 'Long text',
  number: 'Number',
  date: 'In-world date',
  select: 'Single choice',
  multi_select: 'Multiple choice',
  boolean: 'Yes / no',
  url: 'Link',
};

export const fieldDefinitionSchema = z
  .object({
    key: z
      .string()
      .regex(
        /^[a-z][a-z0-9_]{0,47}$/,
        'Lowercase letters, digits and _ only, starting with a letter',
      ),
    label: z.string().trim().min(1, 'Label is required').max(80),
    type: z.enum(FIELD_TYPES),
    options: z.array(z.string().trim().min(1).max(80)).max(100).optional(),
  })
  .superRefine((field, ctx) => {
    const needsOptions = field.type === 'select' || field.type === 'multi_select';
    if (needsOptions && (!field.options || field.options.length === 0)) {
      ctx.addIssue({ code: 'custom', path: ['options'], message: 'Add at least one option' });
    }
    if (field.options && new Set(field.options).size !== field.options.length) {
      ctx.addIssue({ code: 'custom', path: ['options'], message: 'Options must be unique' });
    }
  });
export type FieldDefinition = z.infer<typeof fieldDefinitionSchema>;

export const fieldSchemaSchema = z
  .array(fieldDefinitionSchema)
  .max(60)
  .superRefine((fields, ctx) => {
    const seen = new Set<string>();
    fields.forEach((field, i) => {
      if (seen.has(field.key)) {
        ctx.addIssue({
          code: 'custom',
          path: [i, 'key'],
          message: `Duplicate field key "${field.key}"`,
        });
      }
      seen.add(field.key);
    });
  });

/** What the two dates are called for this type: Born and Died, Founded and Fallen… */
const dateLabelSchema = z.string().trim().min(1, 'A label is required').max(30);

export const entityTypeCreateSchema = z.object({
  name: z.string().trim().min(1, 'Name is required').max(60),
  icon: iconSchema.default('file-text'),
  color: colorSchema.default('#64748b'),
  fieldSchema: fieldSchemaSchema.default([]),
  startLabel: dateLabelSchema.default('Starts'),
  endLabel: dateLabelSchema.default('Ends'),
});
export type EntityTypeCreateInput = z.input<typeof entityTypeCreateSchema>;

export const entityTypeUpdateSchema = z.object({
  name: z.string().trim().min(1, 'Name is required').max(60).optional(),
  icon: iconSchema.optional(),
  color: colorSchema.optional(),
  fieldSchema: fieldSchemaSchema.optional(),
  startLabel: dateLabelSchema.optional(),
  endLabel: dateLabelSchema.optional(),
  sortOrder: z.number().int().min(0).max(10_000).optional(),
});
export type EntityTypeUpdateInput = z.input<typeof entityTypeUpdateSchema>;
