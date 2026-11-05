CREATE TABLE "plot_beats" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"board_id" uuid NOT NULL,
	"title" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"sort_order" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "plot_boards" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"world_id" uuid NOT NULL,
	"name" text NOT NULL,
	"template_key" text DEFAULT 'blank' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "plot_cards" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"board_id" uuid NOT NULL,
	"beat_id" uuid NOT NULL,
	"thread_id" uuid NOT NULL,
	"title" text NOT NULL,
	"text" text DEFAULT '' NOT NULL,
	"scene_id" uuid,
	"color" text,
	"sort_order" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "plot_threads" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"board_id" uuid NOT NULL,
	"name" text NOT NULL,
	"color" text NOT NULL,
	"sort_order" integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "plot_beats_board_id_uq" ON "plot_beats" USING btree ("board_id","id");
--> statement-breakpoint
CREATE UNIQUE INDEX "plot_threads_board_id_uq" ON "plot_threads" USING btree ("board_id","id");
--> statement-breakpoint
ALTER TABLE "plot_beats" ADD CONSTRAINT "plot_beats_board_id_plot_boards_id_fk" FOREIGN KEY ("board_id") REFERENCES "public"."plot_boards"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "plot_boards" ADD CONSTRAINT "plot_boards_world_id_worlds_id_fk" FOREIGN KEY ("world_id") REFERENCES "public"."worlds"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "plot_cards" ADD CONSTRAINT "plot_cards_board_id_plot_boards_id_fk" FOREIGN KEY ("board_id") REFERENCES "public"."plot_boards"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "plot_cards" ADD CONSTRAINT "plot_cards_scene_id_manuscript_nodes_id_fk" FOREIGN KEY ("scene_id") REFERENCES "public"."manuscript_nodes"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "plot_cards" ADD CONSTRAINT "plot_cards_board_id_beat_id_plot_beats_board_id_id_fk" FOREIGN KEY ("board_id","beat_id") REFERENCES "public"."plot_beats"("board_id","id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "plot_cards" ADD CONSTRAINT "plot_cards_board_id_thread_id_plot_threads_board_id_id_fk" FOREIGN KEY ("board_id","thread_id") REFERENCES "public"."plot_threads"("board_id","id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "plot_threads" ADD CONSTRAINT "plot_threads_board_id_plot_boards_id_fk" FOREIGN KEY ("board_id") REFERENCES "public"."plot_boards"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "plot_beats_board_idx" ON "plot_beats" USING btree ("board_id","sort_order");
--> statement-breakpoint
CREATE INDEX "plot_boards_world_idx" ON "plot_boards" USING btree ("world_id");
--> statement-breakpoint
CREATE INDEX "plot_cards_board_idx" ON "plot_cards" USING btree ("board_id");
--> statement-breakpoint
CREATE INDEX "plot_cards_scene_idx" ON "plot_cards" USING btree ("scene_id");
--> statement-breakpoint
CREATE INDEX "plot_threads_board_idx" ON "plot_threads" USING btree ("board_id","sort_order");
