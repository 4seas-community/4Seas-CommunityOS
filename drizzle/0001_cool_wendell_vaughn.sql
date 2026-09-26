CREATE TYPE "public"."agent_draft_status" AS ENUM('open', 'confirmed', 'canceled', 'expired');--> statement-breakpoint
CREATE TABLE "agent_drafts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"key_id" uuid NOT NULL,
	"action" text NOT NULL,
	"payload" jsonb NOT NULL,
	"preview" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"status" "agent_draft_status" DEFAULT 'open' NOT NULL,
	"result_entity_id" text,
	"expires_at" timestamp with time zone NOT NULL,
	"confirmed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "agent_keys" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"key_hash" text NOT NULL,
	"scopes" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"member_id" uuid,
	"last_used_at" timestamp with time zone,
	"revoked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "agent_keys_key_hash_unique" UNIQUE("key_hash")
);
--> statement-breakpoint
ALTER TABLE "agent_drafts" ADD CONSTRAINT "agent_drafts_key_id_agent_keys_id_fk" FOREIGN KEY ("key_id") REFERENCES "public"."agent_keys"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "agent_drafts_key_idx" ON "agent_drafts" USING btree ("key_id","status");--> statement-breakpoint
CREATE INDEX "agent_keys_hash_idx" ON "agent_keys" USING btree ("key_hash");