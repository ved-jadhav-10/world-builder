INSERT INTO "entity_types" ("world_id", "key", "name", "icon", "color", "field_schema", "is_builtin", "sort_order", "start_label", "end_label")
SELECT w."id", 'style_guide', 'Style Guide', 'spell-check', '#0d9488',
  '[{"key":"covers","label":"Covers","type":"select","options":["Whole series","One book","One point-of-view character","A genre or tone","Dialogue","Other"]},{"key":"pov","label":"Point of view","type":"select","options":["First person","Second person","Third limited","Third omniscient","Mixed"]},{"key":"tense","label":"Tense","type":"select","options":["Past","Present","Mixed"]},{"key":"spelling","label":"Spelling","type":"select","options":["US","UK","Canadian","Australian","Invented words"]},{"key":"voice","label":"Voice and tone","type":"long_text"},{"key":"use","label":"Words and phrases to use","type":"long_text"},{"key":"avoid","label":"Words and phrases to avoid","type":"long_text"},{"key":"rules","label":"Other rules","type":"long_text"}]'::jsonb,
  true,
  COALESCE((SELECT MAX(t."sort_order") FROM "entity_types" t WHERE t."world_id" = w."id"), -1) + 1,
  'Adopted', 'Retired'
FROM "worlds" w
ON CONFLICT ("world_id", "key") DO NOTHING;
