ALTER TYPE "public"."map_feature_kind" ADD VALUE 'journey';--> statement-breakpoint
ALTER TYPE "public"."map_feature_kind" ADD VALUE 'arrow';--> statement-breakpoint
ALTER TYPE "public"."map_feature_kind" ADD VALUE 'circle';--> statement-breakpoint
ALTER TABLE "map_features" ADD COLUMN "point_days" jsonb;--> statement-breakpoint
ALTER TABLE "map_features" ADD COLUMN "valid_from_day" bigint;--> statement-breakpoint
ALTER TABLE "map_features" ADD COLUMN "valid_to_day" bigint;