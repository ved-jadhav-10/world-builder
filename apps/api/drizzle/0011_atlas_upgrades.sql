CREATE TABLE "map_layers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"world_id" uuid NOT NULL,
	"map_id" uuid NOT NULL,
	"name" text NOT NULL,
	"visible_by_default" boolean DEFAULT true NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "map_features" ADD COLUMN "gm_notes" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "map_features" ADD COLUMN "layer_id" uuid;--> statement-breakpoint
ALTER TABLE "maps" ADD COLUMN "image_version" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "maps" ADD COLUMN "scale" jsonb;--> statement-breakpoint
ALTER TABLE "map_layers" ADD CONSTRAINT "map_layers_world_id_worlds_id_fk" FOREIGN KEY ("world_id") REFERENCES "public"."worlds"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "map_layers" ADD CONSTRAINT "map_layers_map_id_maps_id_fk" FOREIGN KEY ("map_id") REFERENCES "public"."maps"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "map_layers_map_idx" ON "map_layers" USING btree ("map_id");--> statement-breakpoint
ALTER TABLE "map_features" ADD CONSTRAINT "map_features_layer_id_map_layers_id_fk" FOREIGN KEY ("layer_id") REFERENCES "public"."map_layers"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "map_features_layer_idx" ON "map_features" USING btree ("layer_id");