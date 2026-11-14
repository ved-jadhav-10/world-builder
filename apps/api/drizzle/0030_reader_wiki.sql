ALTER TABLE "entities" ADD COLUMN "reveal_node_id" uuid;--> statement-breakpoint
ALTER TABLE "worlds" ADD COLUMN "wiki_enabled" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "worlds" ADD COLUMN "wiki_password_hash" text;--> statement-breakpoint
ALTER TABLE "worlds" ADD COLUMN "wiki_intro" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "worlds" ADD COLUMN "wiki_show_chapter_titles" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "entities" ADD CONSTRAINT "entities_reveal_node_id_manuscript_nodes_id_fk" FOREIGN KEY ("reveal_node_id") REFERENCES "public"."manuscript_nodes"("id") ON DELETE set null ON UPDATE no action;