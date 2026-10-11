CREATE TABLE "images" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"world_id" uuid NOT NULL,
	"entity_id" uuid,
	"caption" text DEFAULT '' NOT NULL,
	"visibility" "visibility" DEFAULT 'gm' NOT NULL,
	"scene_id" uuid,
	"day" bigint,
	"is_portrait" boolean DEFAULT false NOT NULL,
	"width" integer NOT NULL,
	"height" integer NOT NULL,
	"bytes" integer NOT NULL,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "map_features" ADD COLUMN "visibility" "visibility" DEFAULT 'gm' NOT NULL;--> statement-breakpoint
ALTER TABLE "maps" ADD COLUMN "visibility" "visibility" DEFAULT 'gm' NOT NULL;--> statement-breakpoint
ALTER TABLE "progressions" ADD COLUMN "visibility" "visibility" DEFAULT 'gm' NOT NULL;--> statement-breakpoint
ALTER TABLE "images" ADD CONSTRAINT "images_world_id_worlds_id_fk" FOREIGN KEY ("world_id") REFERENCES "public"."worlds"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "images" ADD CONSTRAINT "images_entity_id_entities_id_fk" FOREIGN KEY ("entity_id") REFERENCES "public"."entities"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "images" ADD CONSTRAINT "images_scene_id_manuscript_nodes_id_fk" FOREIGN KEY ("scene_id") REFERENCES "public"."manuscript_nodes"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "images" ADD CONSTRAINT "images_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "images_world_idx" ON "images" USING btree ("world_id");--> statement-breakpoint
CREATE INDEX "images_entity_idx" ON "images" USING btree ("entity_id");--> statement-breakpoint
CREATE UNIQUE INDEX "images_one_portrait_uq" ON "images" USING btree ("entity_id") WHERE "images"."is_portrait";
--> statement-breakpoint
INSERT INTO "entity_types" ("world_id", "key", "name", "icon", "color", "field_schema", "is_builtin", "sort_order", "start_label", "end_label")
SELECT w."id", 'quest', 'Quest', 'scroll-text', '#d97706',
  '[{"key":"status","label":"Status","type":"select","options":["Not started","Ongoing","Completed","Abandoned"]},{"key":"objectives","label":"Objectives","type":"long_text"},{"key":"reward","label":"Reward","type":"text"}]'::jsonb,
  true,
  COALESCE((SELECT MAX(t."sort_order") FROM "entity_types" t WHERE t."world_id" = w."id"), -1) + 1,
  'Offered', 'Resolved'
FROM "worlds" w
ON CONFLICT ("world_id", "key") DO NOTHING;
--> statement-breakpoint
INSERT INTO "relationship_types" ("world_id", "key", "label", "inverse_label", "is_builtin")
SELECT "id", 'given_by', 'given by', 'gave quest', true FROM "worlds"
ON CONFLICT ("world_id", "key") DO NOTHING;
