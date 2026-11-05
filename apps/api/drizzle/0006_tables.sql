CREATE TABLE "roll_table_rows" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"table_id" uuid NOT NULL,
	"sort_order" integer NOT NULL,
	"weight" integer DEFAULT 1 NOT NULL,
	"text" text NOT NULL,
	CONSTRAINT "roll_table_rows_weight_chk" CHECK ("roll_table_rows"."weight" >= 1)
);
--> statement-breakpoint
CREATE TABLE "roll_tables" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"world_id" uuid NOT NULL,
	"name" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"visibility" "visibility" DEFAULT 'gm' NOT NULL,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "rolls" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"world_id" uuid NOT NULL,
	"user_id" text,
	"kind" text NOT NULL,
	"label" text NOT NULL,
	"summary" text NOT NULL,
	"detail" jsonb NOT NULL,
	"visibility" "visibility" DEFAULT 'gm' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "rolls_kind_chk" CHECK ("rolls"."kind" IN ('dice', 'table')),
	CONSTRAINT "rolls_visibility_chk" CHECK ("rolls"."visibility" IN ('gm', 'player'))
);
--> statement-breakpoint
ALTER TABLE "roll_table_rows" ADD CONSTRAINT "roll_table_rows_table_id_roll_tables_id_fk" FOREIGN KEY ("table_id") REFERENCES "public"."roll_tables"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "roll_tables" ADD CONSTRAINT "roll_tables_world_id_worlds_id_fk" FOREIGN KEY ("world_id") REFERENCES "public"."worlds"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "roll_tables" ADD CONSTRAINT "roll_tables_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rolls" ADD CONSTRAINT "rolls_world_id_worlds_id_fk" FOREIGN KEY ("world_id") REFERENCES "public"."worlds"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rolls" ADD CONSTRAINT "rolls_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "roll_table_rows_table_idx" ON "roll_table_rows" USING btree ("table_id","sort_order");--> statement-breakpoint
CREATE UNIQUE INDEX "roll_tables_world_name_uq" ON "roll_tables" USING btree ("world_id",lower("name"));--> statement-breakpoint
CREATE INDEX "rolls_world_created_idx" ON "rolls" USING btree ("world_id","created_at");