CREATE TABLE "comments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"world_id" uuid NOT NULL,
	"entity_id" uuid,
	"node_id" uuid,
	"parent_id" uuid,
	"author_id" text,
	"body" text NOT NULL,
	"resolved_at" timestamp with time zone,
	"edited_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "comments_one_subject_chk" CHECK (num_nonnulls("comments"."entity_id", "comments"."node_id") = 1)
);
--> statement-breakpoint
ALTER TABLE "comments" ADD CONSTRAINT "comments_world_id_worlds_id_fk" FOREIGN KEY ("world_id") REFERENCES "public"."worlds"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comments" ADD CONSTRAINT "comments_entity_id_entities_id_fk" FOREIGN KEY ("entity_id") REFERENCES "public"."entities"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comments" ADD CONSTRAINT "comments_node_id_manuscript_nodes_id_fk" FOREIGN KEY ("node_id") REFERENCES "public"."manuscript_nodes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comments" ADD CONSTRAINT "comments_parent_id_comments_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."comments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comments" ADD CONSTRAINT "comments_author_id_user_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "comments_entity_idx" ON "comments" USING btree ("entity_id","created_at");--> statement-breakpoint
CREATE INDEX "comments_node_idx" ON "comments" USING btree ("node_id","created_at");--> statement-breakpoint
CREATE INDEX "comments_world_idx" ON "comments" USING btree ("world_id","resolved_at");
