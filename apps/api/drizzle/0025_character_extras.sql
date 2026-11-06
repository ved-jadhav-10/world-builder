-- Character extras: a speech and dialogue sheet, a colour palette, abilities with charges and an
-- interview for the built-in Character type, and innate abilities for Species. Added to worlds
-- that already have those types, unless a field with the same key is already there.
UPDATE "entity_types"
SET "field_schema" = "field_schema" || '[{"key":"speech_style","label":"Speech style","type":"long_text"}]'::jsonb
WHERE "key" = 'character' AND "is_builtin" AND NOT ("field_schema" @> '[{"key":"speech_style"}]'::jsonb);
--> statement-breakpoint
UPDATE "entity_types"
SET "field_schema" = "field_schema" || '[{"key":"verbal_tics","label":"Verbal tics and catchphrases","type":"long_text"}]'::jsonb
WHERE "key" = 'character' AND "is_builtin" AND NOT ("field_schema" @> '[{"key":"verbal_tics"}]'::jsonb);
--> statement-breakpoint
UPDATE "entity_types"
SET "field_schema" = "field_schema" || '[{"key":"sample_dialogue","label":"Sample dialogue","type":"long_text"}]'::jsonb
WHERE "key" = 'character' AND "is_builtin" AND NOT ("field_schema" @> '[{"key":"sample_dialogue"}]'::jsonb);
--> statement-breakpoint
UPDATE "entity_types"
SET "field_schema" = "field_schema" || '[{"key":"palette","label":"Colour palette","type":"palette"}]'::jsonb
WHERE "key" = 'character' AND "is_builtin" AND NOT ("field_schema" @> '[{"key":"palette"}]'::jsonb);
--> statement-breakpoint
UPDATE "entity_types"
SET "field_schema" = "field_schema" || '[{"key":"abilities","label":"Abilities","type":"abilities"}]'::jsonb
WHERE "key" = 'character' AND "is_builtin" AND NOT ("field_schema" @> '[{"key":"abilities"}]'::jsonb);
--> statement-breakpoint
UPDATE "entity_types"
SET "field_schema" = "field_schema" || '[{"key":"interview","label":"Interview","type":"qa"}]'::jsonb
WHERE "key" = 'character' AND "is_builtin" AND NOT ("field_schema" @> '[{"key":"interview"}]'::jsonb);
--> statement-breakpoint
UPDATE "entity_types"
SET "field_schema" = "field_schema" || '[{"key":"innate_abilities","label":"Innate abilities","type":"abilities"}]'::jsonb
WHERE "key" = 'species' AND "is_builtin" AND NOT ("field_schema" @> '[{"key":"innate_abilities"}]'::jsonb);
