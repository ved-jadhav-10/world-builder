CREATE TABLE "diplomacy_scores" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"world_id" uuid NOT NULL,
	"low_id" uuid NOT NULL,
	"high_id" uuid NOT NULL,
	"score" integer NOT NULL,
	"notes" text DEFAULT '' NOT NULL,
	"visibility" "visibility" DEFAULT 'gm' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "diplomacy_scores_range" CHECK ("diplomacy_scores"."score" between -100 and 100),
	CONSTRAINT "diplomacy_scores_order" CHECK ("diplomacy_scores"."low_id" < "diplomacy_scores"."high_id")
);
--> statement-breakpoint
ALTER TABLE "diplomacy_scores" ADD CONSTRAINT "diplomacy_scores_world_id_worlds_id_fk" FOREIGN KEY ("world_id") REFERENCES "public"."worlds"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "diplomacy_scores" ADD CONSTRAINT "diplomacy_scores_low_id_entities_id_fk" FOREIGN KEY ("low_id") REFERENCES "public"."entities"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "diplomacy_scores" ADD CONSTRAINT "diplomacy_scores_high_id_entities_id_fk" FOREIGN KEY ("high_id") REFERENCES "public"."entities"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "diplomacy_scores_pair_uq" ON "diplomacy_scores" USING btree ("low_id","high_id");--> statement-breakpoint
CREATE INDEX "diplomacy_scores_world_idx" ON "diplomacy_scores" USING btree ("world_id");