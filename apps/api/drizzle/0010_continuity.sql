CREATE TABLE "continuity_dismissals" (
	"world_id" uuid NOT NULL,
	"key" text NOT NULL,
	"dismissed_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "continuity_dismissals_world_id_key_pk" PRIMARY KEY("world_id","key")
);
--> statement-breakpoint
ALTER TABLE "continuity_dismissals" ADD CONSTRAINT "continuity_dismissals_world_id_worlds_id_fk" FOREIGN KEY ("world_id") REFERENCES "public"."worlds"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "continuity_dismissals" ADD CONSTRAINT "continuity_dismissals_dismissed_by_user_id_fk" FOREIGN KEY ("dismissed_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;