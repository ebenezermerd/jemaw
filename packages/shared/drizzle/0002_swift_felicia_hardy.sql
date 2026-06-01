CREATE TYPE "public"."payment_method" AS ENUM('cash', 'bank', 'telebirr', 'other');--> statement-breakpoint
ALTER TABLE "settlements" ADD COLUMN "method" "payment_method" DEFAULT 'cash' NOT NULL;--> statement-breakpoint
ALTER TABLE "settlements" ADD COLUMN "description" text;--> statement-breakpoint
ALTER TABLE "settlements" ADD COLUMN "expense_ids" jsonb;--> statement-breakpoint
ALTER TABLE "settlements" ADD COLUMN "occurred_at" timestamp with time zone;