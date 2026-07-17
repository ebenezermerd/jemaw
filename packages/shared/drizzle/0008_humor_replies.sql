CREATE TYPE "public"."bot_reply_decision" AS ENUM('sent', 'suppressed', 'failed');--> statement-breakpoint
CREATE TABLE "bot_replies" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"group_id" uuid NOT NULL,
	"trigger_event" text NOT NULL,
	"channel" text NOT NULL,
	"decision" "bot_reply_decision" NOT NULL,
	"suppression_reason" text,
	"template_id" text,
	"provider" text,
	"model" text,
	"prompt_version" text,
	"fact_packet_redacted" jsonb,
	"fact_hash" text,
	"candidate_texts" jsonb,
	"selected_text" text,
	"selected_style" text,
	"risk_class" text,
	"telegram_message_id" bigint,
	"latency_ms" integer,
	"input_tokens" integer,
	"output_tokens" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "bot_reply_feedback" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"bot_reply_id" uuid NOT NULL,
	"member_id" uuid NOT NULL,
	"feedback_type" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "humor_member_preferences" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"group_id" uuid NOT NULL,
	"member_id" uuid NOT NULL,
	"contribute_to_style_profile" boolean DEFAULT true NOT NULL,
	"allow_callback_from_messages" boolean DEFAULT false NOT NULL,
	"allow_direct_reference" boolean DEFAULT false NOT NULL,
	"allow_public_financial_roasting" boolean DEFAULT false NOT NULL,
	"allow_hardship_humor" boolean DEFAULT false NOT NULL,
	"allow_relationship_humor" boolean DEFAULT false NOT NULL,
	"allow_security_incident_humor" boolean DEFAULT false NOT NULL,
	"allow_profanity_targeting" boolean DEFAULT false NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "humor_member_preferences_group_id_member_id_unique" UNIQUE("group_id","member_id")
);
--> statement-breakpoint
ALTER TABLE "bot_replies" ADD CONSTRAINT "bot_replies_group_id_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."groups"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bot_reply_feedback" ADD CONSTRAINT "bot_reply_feedback_bot_reply_id_bot_replies_id_fk" FOREIGN KEY ("bot_reply_id") REFERENCES "public"."bot_replies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bot_reply_feedback" ADD CONSTRAINT "bot_reply_feedback_member_id_members_id_fk" FOREIGN KEY ("member_id") REFERENCES "public"."members"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "humor_member_preferences" ADD CONSTRAINT "humor_member_preferences_group_id_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."groups"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "humor_member_preferences" ADD CONSTRAINT "humor_member_preferences_member_id_members_id_fk" FOREIGN KEY ("member_id") REFERENCES "public"."members"("id") ON DELETE no action ON UPDATE no action;
