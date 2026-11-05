CREATE TYPE "public"."revision_kind" AS ENUM('auto', 'manual', 'restore');--> statement-breakpoint
CREATE TABLE "revisions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"world_id" uuid NOT NULL,
	"entity_id" uuid,
	"node_id" uuid,
	"kind" "revision_kind" NOT NULL,
	"label" text DEFAULT '' NOT NULL,
	"content" jsonb NOT NULL,
	"content_hash" text NOT NULL,
	"title" text DEFAULT '' NOT NULL,
	"words" integer DEFAULT 0 NOT NULL,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "revisions_one_subject_chk" CHECK (num_nonnulls("revisions"."entity_id", "revisions"."node_id") = 1)
);
--> statement-breakpoint
ALTER TABLE "revisions" ADD CONSTRAINT "revisions_world_id_worlds_id_fk" FOREIGN KEY ("world_id") REFERENCES "public"."worlds"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "revisions" ADD CONSTRAINT "revisions_entity_id_entities_id_fk" FOREIGN KEY ("entity_id") REFERENCES "public"."entities"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "revisions" ADD CONSTRAINT "revisions_node_id_manuscript_nodes_id_fk" FOREIGN KEY ("node_id") REFERENCES "public"."manuscript_nodes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "revisions" ADD CONSTRAINT "revisions_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "revisions_entity_idx" ON "revisions" USING btree ("entity_id","created_at");--> statement-breakpoint
CREATE INDEX "revisions_node_idx" ON "revisions" USING btree ("node_id","created_at");