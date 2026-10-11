CREATE TYPE "public"."manuscript_node_kind" AS ENUM('book', 'part', 'chapter', 'scene');--> statement-breakpoint
CREATE TABLE "manuscript_nodes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"world_id" uuid NOT NULL,
	"kind" "manuscript_node_kind" NOT NULL,
	"parent_id" uuid,
	"title" text NOT NULL,
	"summary" text DEFAULT '' NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"body" jsonb,
	"plain_text" text DEFAULT '' NOT NULL,
	"word_count" integer DEFAULT 0 NOT NULL,
	"pov_id" uuid,
	"location_id" uuid,
	"in_world_date" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "scene_mentions" (
	"scene_id" uuid NOT NULL,
	"entity_id" uuid NOT NULL,
	"count" integer NOT NULL,
	CONSTRAINT "scene_mentions_scene_id_entity_id_pk" PRIMARY KEY("scene_id","entity_id")
);
--> statement-breakpoint
ALTER TABLE "manuscript_nodes" ADD CONSTRAINT "manuscript_nodes_world_id_worlds_id_fk" FOREIGN KEY ("world_id") REFERENCES "public"."worlds"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "manuscript_nodes" ADD CONSTRAINT "manuscript_nodes_parent_id_manuscript_nodes_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."manuscript_nodes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "manuscript_nodes" ADD CONSTRAINT "manuscript_nodes_pov_id_entities_id_fk" FOREIGN KEY ("pov_id") REFERENCES "public"."entities"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "manuscript_nodes" ADD CONSTRAINT "manuscript_nodes_location_id_entities_id_fk" FOREIGN KEY ("location_id") REFERENCES "public"."entities"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scene_mentions" ADD CONSTRAINT "scene_mentions_scene_id_manuscript_nodes_id_fk" FOREIGN KEY ("scene_id") REFERENCES "public"."manuscript_nodes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scene_mentions" ADD CONSTRAINT "scene_mentions_entity_id_entities_id_fk" FOREIGN KEY ("entity_id") REFERENCES "public"."entities"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "manuscript_nodes_world_idx" ON "manuscript_nodes" USING btree ("world_id");--> statement-breakpoint
CREATE INDEX "manuscript_nodes_parent_idx" ON "manuscript_nodes" USING btree ("parent_id","sort_order");--> statement-breakpoint
CREATE INDEX "scene_mentions_entity_idx" ON "scene_mentions" USING btree ("entity_id");