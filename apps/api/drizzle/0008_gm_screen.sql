CREATE TABLE "gm_screens" (
	"world_id" uuid NOT NULL,
	"user_id" text NOT NULL,
	"widgets" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "gm_screens_world_id_user_id_pk" PRIMARY KEY("world_id","user_id")
);
--> statement-breakpoint
ALTER TABLE "gm_screens" ADD CONSTRAINT "gm_screens_world_id_worlds_id_fk" FOREIGN KEY ("world_id") REFERENCES "public"."worlds"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gm_screens" ADD CONSTRAINT "gm_screens_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;