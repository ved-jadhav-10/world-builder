-- Shops and merchants: a "Wares for sale" list on the built-in Location and Character types, added
-- to worlds that already have those types unless a field with the same key is already there.
UPDATE "entity_types"
SET "field_schema" = "field_schema" || '[{"key":"wares","label":"Wares for sale","type":"inventory"}]'::jsonb
WHERE "key" IN ('location', 'character') AND "is_builtin" AND NOT ("field_schema" @> '[{"key":"wares"}]'::jsonb);
