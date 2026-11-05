INSERT INTO "entity_types" ("world_id", "key", "name", "icon", "color", "field_schema", "is_builtin", "sort_order", "start_label", "end_label")
SELECT w."id", 'religion', 'Religion', 'sun', '#ca8a04',
  '[{"key":"kind","label":"Kind","type":"select","options":["Monotheistic","Polytheistic","Animist","Ancestor worship","Philosophy","Cult"]},{"key":"deities","label":"Deities and powers","type":"long_text"},{"key":"beliefs","label":"Core beliefs","type":"long_text"},{"key":"practices","label":"Practices and rites","type":"long_text"},{"key":"holy_sites","label":"Holy sites","type":"long_text"},{"key":"clergy","label":"Clergy and structure","type":"long_text"},{"key":"followers","label":"Followers","type":"text"}]'::jsonb,
  true,
  COALESCE((SELECT MAX(t."sort_order") FROM "entity_types" t WHERE t."world_id" = w."id"), -1) + 1,
  'Founded', 'Ended'
FROM "worlds" w
ON CONFLICT ("world_id", "key") DO NOTHING;
--> statement-breakpoint
INSERT INTO "entity_types" ("world_id", "key", "name", "icon", "color", "field_schema", "is_builtin", "sort_order", "start_label", "end_label")
SELECT w."id", 'language', 'Language', 'languages', '#0891b2',
  '[{"key":"status","label":"Status","type":"select","options":["Living","Dead","Ceremonial","Constructed"]},{"key":"spoken_by","label":"Spoken by","type":"text"},{"key":"family","label":"Language family","type":"text"},{"key":"script","label":"Script","type":"text"},{"key":"sounds","label":"Sounds and spelling","type":"long_text"},{"key":"grammar","label":"Grammar notes","type":"long_text"},{"key":"phrases","label":"Sample phrases","type":"long_text"}]'::jsonb,
  true,
  COALESCE((SELECT MAX(t."sort_order") FROM "entity_types" t WHERE t."world_id" = w."id"), -1) + 1,
  'Emerged', 'Died out'
FROM "worlds" w
ON CONFLICT ("world_id", "key") DO NOTHING;
--> statement-breakpoint
INSERT INTO "entity_types" ("world_id", "key", "name", "icon", "color", "field_schema", "is_builtin", "sort_order", "start_label", "end_label")
SELECT w."id", 'system', 'Magic or Tech System', 'wand-sparkles', '#9333ea',
  '[{"key":"kind","label":"Kind","type":"select","options":["Magic","Technology","Divine power","Psionics","Hybrid"]},{"key":"source","label":"Source of power","type":"long_text"},{"key":"how_it_works","label":"How it works","type":"long_text"},{"key":"limits","label":"Limits and costs","type":"long_text"},{"key":"users","label":"Who can use it","type":"long_text"},{"key":"gm_notes","label":"Rules and ruling notes","type":"long_text"}]'::jsonb,
  true,
  COALESCE((SELECT MAX(t."sort_order") FROM "entity_types" t WHERE t."world_id" = w."id"), -1) + 1,
  'Discovered', 'Lost'
FROM "worlds" w
ON CONFLICT ("world_id", "key") DO NOTHING;
--> statement-breakpoint
INSERT INTO "entity_types" ("world_id", "key", "name", "icon", "color", "field_schema", "is_builtin", "sort_order", "start_label", "end_label")
SELECT w."id", 'glossary_term', 'Glossary Term', 'book-a', '#64748b',
  '[{"key":"pronunciation","label":"Pronunciation","type":"text"},{"key":"category","label":"Category","type":"text"},{"key":"meaning","label":"Meaning","type":"long_text"},{"key":"used_by","label":"Used by","type":"text"}]'::jsonb,
  true,
  COALESCE((SELECT MAX(t."sort_order") FROM "entity_types" t WHERE t."world_id" = w."id"), -1) + 1,
  'Coined', 'Fell out of use'
FROM "worlds" w
ON CONFLICT ("world_id", "key") DO NOTHING;
