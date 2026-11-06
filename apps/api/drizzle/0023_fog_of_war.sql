ALTER TYPE "public"."map_feature_kind" ADD VALUE 'reveal';--> statement-breakpoint
ALTER TABLE "maps" ADD COLUMN "fog_enabled" boolean DEFAULT false NOT NULL;