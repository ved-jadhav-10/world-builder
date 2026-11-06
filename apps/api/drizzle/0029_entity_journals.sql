CREATE TABLE "entity_journals" (
	"entity_id" uuid NOT NULL,
	"user_id" text NOT NULL,
	"world_id" uuid NOT NULL,
	"body" text NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "entity_journals_entity_id_user_id_pk" PRIMARY KEY("entity_id","user_id")
);
--> statement-breakpoint
ALTER TABLE "entity_journals" ADD CONSTRAINT "entity_journals_entity_id_entities_id_fk" FOREIGN KEY ("entity_id") REFERENCES "public"."entities"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "entity_journals" ADD CONSTRAINT "entity_journals_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "entity_journals" ADD CONSTRAINT "entity_journals_world_id_worlds_id_fk" FOREIGN KEY ("world_id") REFERENCES "public"."worlds"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "entity_journals_user_idx" ON "entity_journals" USING btree ("world_id","user_id");