CREATE TABLE IF NOT EXISTS "chat_actions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"group_id" uuid NOT NULL REFERENCES "groups"("id"),
	"requested_by_telegram_id" bigint NOT NULL,
	"actor_member_id" uuid NOT NULL REFERENCES "members"("id"),
	"kind" text NOT NULL,
	"payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"options" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"selected" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"result" jsonb,
	"chat_id" bigint NOT NULL,
	"message_id" bigint,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL
);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "chat_actions_group_idx" ON "chat_actions" ("group_id", "created_at");
