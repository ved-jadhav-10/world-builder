CREATE TYPE "public"."map_feature_kind" AS ENUM('pin', 'label', 'path', 'region');--> statement-breakpoint
CREATE TYPE "public"."map_feature_size" AS ENUM('sm', 'md', 'lg');--> statement-breakpoint
CREATE TYPE "public"."map_line_style" AS ENUM('solid', 'dashed', 'dotted');--> statement-breakpoint
CREATE TYPE "public"."map_status" AS ENUM('processing', 'ready', 'failed');--> statement-breakpoint
CREATE TABLE "map_features" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"world_id" uuid NOT NULL,
	"map_id" uuid NOT NULL,
	"kind" "map_feature_kind" NOT NULL,
	"points" jsonb NOT NULL,
	"label" text DEFAULT '' NOT NULL,
	"notes" text DEFAULT '' NOT NULL,
	"entity_id" uuid,
	"link_map_id" uuid,
	"icon" text,
	"color" text,
	"size" "map_feature_size" DEFAULT 'md' NOT NULL,
	"line_style" "map_line_style" DEFAULT 'solid' NOT NULL,
	"min_zoom" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "maps" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"world_id" uuid NOT NULL,
	"parent_id" uuid,
	"entity_id" uuid,
	"name" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"status" "map_status" DEFAULT 'processing' NOT NULL,
	"error" text DEFAULT '' NOT NULL,
	"width" integer NOT NULL,
	"height" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "map_features" ADD CONSTRAINT "map_features_world_id_worlds_id_fk" FOREIGN KEY ("world_id") REFERENCES "public"."worlds"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "map_features" ADD CONSTRAINT "map_features_map_id_maps_id_fk" FOREIGN KEY ("map_id") REFERENCES "public"."maps"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "map_features" ADD CONSTRAINT "map_features_entity_id_entities_id_fk" FOREIGN KEY ("entity_id") REFERENCES "public"."entities"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "map_features" ADD CONSTRAINT "map_features_link_map_id_maps_id_fk" FOREIGN KEY ("link_map_id") REFERENCES "public"."maps"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "maps" ADD CONSTRAINT "maps_world_id_worlds_id_fk" FOREIGN KEY ("world_id") REFERENCES "public"."worlds"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "maps" ADD CONSTRAINT "maps_parent_id_maps_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."maps"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "maps" ADD CONSTRAINT "maps_entity_id_entities_id_fk" FOREIGN KEY ("entity_id") REFERENCES "public"."entities"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "map_features_map_idx" ON "map_features" USING btree ("map_id");--> statement-breakpoint
CREATE INDEX "map_features_world_idx" ON "map_features" USING btree ("world_id");--> statement-breakpoint
CREATE INDEX "map_features_entity_idx" ON "map_features" USING btree ("entity_id");--> statement-breakpoint
CREATE INDEX "maps_world_idx" ON "maps" USING btree ("world_id");--> statement-breakpoint
CREATE INDEX "maps_parent_idx" ON "maps" USING btree ("parent_id");--> statement-breakpoint
CREATE INDEX "maps_entity_idx" ON "maps" USING btree ("entity_id");