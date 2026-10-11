CREATE TABLE "calendars" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"world_id" uuid NOT NULL,
	"name" text NOT NULL,
	"definition" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "calendars_world_id_unique" UNIQUE("world_id")
);
--> statement-breakpoint
CREATE TABLE "progressions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"world_id" uuid NOT NULL,
	"entity_id" uuid NOT NULL,
	"title" text NOT NULL,
	"note" text DEFAULT '' NOT NULL,
	"scene_id" uuid,
	"day" bigint,
	"changes" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "entities" ADD COLUMN "start_day" bigint;--> statement-breakpoint
ALTER TABLE "entities" ADD COLUMN "end_day" bigint;--> statement-breakpoint
ALTER TABLE "entity_types" ADD COLUMN "start_label" text DEFAULT 'Starts' NOT NULL;--> statement-breakpoint
ALTER TABLE "entity_types" ADD COLUMN "end_label" text DEFAULT 'Ends' NOT NULL;--> statement-breakpoint
ALTER TABLE "manuscript_nodes" ADD COLUMN "in_world_day" bigint;--> statement-breakpoint
ALTER TABLE "calendars" ADD CONSTRAINT "calendars_world_id_worlds_id_fk" FOREIGN KEY ("world_id") REFERENCES "public"."worlds"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "progressions" ADD CONSTRAINT "progressions_world_id_worlds_id_fk" FOREIGN KEY ("world_id") REFERENCES "public"."worlds"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "progressions" ADD CONSTRAINT "progressions_entity_id_entities_id_fk" FOREIGN KEY ("entity_id") REFERENCES "public"."entities"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "progressions" ADD CONSTRAINT "progressions_scene_id_manuscript_nodes_id_fk" FOREIGN KEY ("scene_id") REFERENCES "public"."manuscript_nodes"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "progressions_entity_idx" ON "progressions" USING btree ("entity_id");--> statement-breakpoint
CREATE INDEX "progressions_world_idx" ON "progressions" USING btree ("world_id");--> statement-breakpoint
CREATE INDEX "entities_world_start_idx" ON "entities" USING btree ("world_id","start_day");
--> statement-breakpoint
UPDATE "entity_types" SET "start_label" = 'Born', "end_label" = 'Died' WHERE "is_builtin" AND "key" = 'character';
--> statement-breakpoint
UPDATE "entity_types" SET "start_label" = 'Founded', "end_label" = 'Abandoned' WHERE "is_builtin" AND "key" = 'location';
--> statement-breakpoint
UPDATE "entity_types" SET "start_label" = 'Founded', "end_label" = 'Dissolved' WHERE "is_builtin" AND "key" = 'faction';
--> statement-breakpoint
UPDATE "entity_types" SET "start_label" = 'Created', "end_label" = 'Destroyed' WHERE "is_builtin" AND "key" = 'item';
--> statement-breakpoint
UPDATE "entity_types" SET "start_label" = 'Appeared', "end_label" = 'Died out' WHERE "is_builtin" AND "key" = 'species';
--> statement-breakpoint
UPDATE "entity_types" SET "start_label" = 'Emerged', "end_label" = 'Faded' WHERE "is_builtin" AND "key" = 'culture';
--> statement-breakpoint
UPDATE "entity_types" SET "start_label" = 'Begins', "end_label" = 'Ends' WHERE "is_builtin" AND "key" = 'event';
--> statement-breakpoint
INSERT INTO "relationship_types" ("world_id", "key", "label", "inverse_label", "is_builtin")
SELECT "id", 'took_part_in', 'took part in', 'had participant', true FROM "worlds"
ON CONFLICT ("world_id", "key") DO NOTHING;
