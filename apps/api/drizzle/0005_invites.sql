CREATE TABLE "world_invites" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"world_id" uuid NOT NULL,
	"role" "world_role" NOT NULL,
	"label" text DEFAULT '' NOT NULL,
	"token_hash" text NOT NULL,
	"max_uses" integer,
	"uses" integer DEFAULT 0 NOT NULL,
	"expires_at" timestamp with time zone,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "world_invites_token_hash_unique" UNIQUE("token_hash"),
	CONSTRAINT "world_invites_not_owner_chk" CHECK ("world_invites"."role" <> 'owner'),
	CONSTRAINT "world_invites_uses_chk" CHECK ("world_invites"."max_uses" IS NULL OR "world_invites"."uses" <= "world_invites"."max_uses")
);
--> statement-breakpoint
ALTER TABLE "world_invites" ADD CONSTRAINT "world_invites_world_id_worlds_id_fk" FOREIGN KEY ("world_id") REFERENCES "public"."worlds"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "world_invites" ADD CONSTRAINT "world_invites_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "world_invites_world_idx" ON "world_invites" USING btree ("world_id");