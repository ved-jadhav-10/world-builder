CREATE TABLE "boards" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"world_id" uuid NOT NULL,
	"name" text NOT NULL,
	"kind" text DEFAULT 'canvas' NOT NULL,
	"shared" boolean DEFAULT false NOT NULL,
	"doc" jsonb DEFAULT '{"items":[],"links":[]}'::jsonb NOT NULL,
	"version" integer DEFAULT 0 NOT NULL,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "boards_kind_chk" CHECK ("boards"."kind" IN ('canvas', 'mood'))
);
--> statement-breakpoint
ALTER TABLE "boards" ADD CONSTRAINT "boards_world_id_worlds_id_fk" FOREIGN KEY ("world_id") REFERENCES "public"."worlds"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "boards" ADD CONSTRAINT "boards_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "boards_world_idx" ON "boards" USING btree ("world_id","updated_at");