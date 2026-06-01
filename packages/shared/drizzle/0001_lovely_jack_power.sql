CREATE TYPE "public"."suggestion_kind" AS ENUM('expense', 'settlement');--> statement-breakpoint
ALTER TABLE "suggestions" ALTER COLUMN "amount" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "suggestions" ADD COLUMN "kind" "suggestion_kind" DEFAULT 'expense' NOT NULL;--> statement-breakpoint
ALTER TABLE "suggestions" ADD COLUMN "from_member_id" uuid;--> statement-breakpoint
ALTER TABLE "suggestions" ADD COLUMN "to_member_id" uuid;--> statement-breakpoint
ALTER TABLE "suggestions" ADD CONSTRAINT "suggestions_from_member_id_members_id_fk" FOREIGN KEY ("from_member_id") REFERENCES "public"."members"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "suggestions" ADD CONSTRAINT "suggestions_to_member_id_members_id_fk" FOREIGN KEY ("to_member_id") REFERENCES "public"."members"("id") ON DELETE no action ON UPDATE no action;