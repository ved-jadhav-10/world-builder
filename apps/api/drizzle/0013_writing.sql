CREATE TABLE "writing_days" (
	"world_id" uuid NOT NULL,
	"user_id" text NOT NULL,
	"day" date NOT NULL,
	"words" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "writing_days_world_id_user_id_day_pk" PRIMARY KEY("world_id","user_id","day")
);
--> statement-breakpoint
CREATE TABLE "writing_goals" (
	"world_id" uuid NOT NULL,
	"user_id" text NOT NULL,
	"daily_words" integer,
	"total_words" integer,
	"deadline" date,
	"timezone" text DEFAULT 'UTC' NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "writing_goals_world_id_user_id_pk" PRIMARY KEY("world_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "writing_sprints" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"world_id" uuid NOT NULL,
	"user_id" text NOT NULL,
	"minutes" integer NOT NULL,
	"words" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "writing_days" ADD CONSTRAINT "writing_days_world_id_worlds_id_fk" FOREIGN KEY ("world_id") REFERENCES "public"."worlds"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "writing_days" ADD CONSTRAINT "writing_days_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "writing_goals" ADD CONSTRAINT "writing_goals_world_id_worlds_id_fk" FOREIGN KEY ("world_id") REFERENCES "public"."worlds"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "writing_goals" ADD CONSTRAINT "writing_goals_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "writing_sprints" ADD CONSTRAINT "writing_sprints_world_id_worlds_id_fk" FOREIGN KEY ("world_id") REFERENCES "public"."worlds"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "writing_sprints" ADD CONSTRAINT "writing_sprints_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "writing_sprints_user_idx" ON "writing_sprints" USING btree ("world_id","user_id","created_at");