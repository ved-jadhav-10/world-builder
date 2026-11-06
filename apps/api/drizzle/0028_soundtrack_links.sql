-- Soundtrack links: a list of named links on the built-in Location (Soundtrack), Character
-- (Theme music) and Session (Playlist) types, added to worlds that have those types unless a
-- field with the same key is already there.
UPDATE "entity_types"
SET "field_schema" = "field_schema" || '[{"key":"soundtrack","label":"Soundtrack","type":"links"}]'::jsonb
WHERE "key" = 'location' AND "is_builtin" AND NOT ("field_schema" @> '[{"key":"soundtrack"}]'::jsonb);
--> statement-breakpoint
UPDATE "entity_types"
SET "field_schema" = "field_schema" || '[{"key":"soundtrack","label":"Theme music","type":"links"}]'::jsonb
WHERE "key" = 'character' AND "is_builtin" AND NOT ("field_schema" @> '[{"key":"soundtrack"}]'::jsonb);
--> statement-breakpoint
UPDATE "entity_types"
SET "field_schema" = "field_schema" || '[{"key":"soundtrack","label":"Playlist","type":"links"}]'::jsonb
WHERE "key" = 'session' AND "is_builtin" AND NOT ("field_schema" @> '[{"key":"soundtrack"}]'::jsonb);
