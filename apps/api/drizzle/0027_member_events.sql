CREATE TABLE "world_member_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"world_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"user_id" text,
	"user_name" text NOT NULL,
	"role" text,
	"detail" text DEFAULT '' NOT NULL,
	"actor_name" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "world_member_events" ADD CONSTRAINT "world_member_events_world_id_worlds_id_fk" FOREIGN KEY ("world_id") REFERENCES "public"."worlds"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "world_member_events" ADD CONSTRAINT "world_member_events_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "world_member_events_world_idx" ON "world_member_events" USING btree ("world_id","created_at");