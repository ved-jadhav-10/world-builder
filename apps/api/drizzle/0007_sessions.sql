INSERT INTO "entity_types" ("world_id", "key", "name", "icon", "color", "field_schema", "is_builtin", "sort_order", "start_label", "end_label")
SELECT w."id", 'session', 'Session', 'notebook-pen', '#7c3aed',
  '[{"key":"number","label":"Number","type":"number"},{"key":"status","label":"Status","type":"select","options":["Planned","Played"]},{"key":"played_on","label":"Played on","type":"text"},{"key":"recap","label":"Recap","type":"long_text"},{"key":"next_up","label":"Threads for next time","type":"long_text"}]'::jsonb,
  true,
  COALESCE((SELECT MAX(t."sort_order") FROM "entity_types" t WHERE t."world_id" = w."id"), -1) + 1,
  'Story starts', 'Story ends'
FROM "worlds" w
ON CONFLICT ("world_id", "key") DO NOTHING;
--> statement-breakpoint
INSERT INTO "relationship_types" ("world_id", "key", "label", "inverse_label", "is_builtin")
SELECT "id", 'featured', 'features', 'featured in', true FROM "worlds"
ON CONFLICT ("world_id", "key") DO NOTHING;
