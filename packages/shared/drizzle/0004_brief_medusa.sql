CREATE TYPE "public"."expense_kind" AS ENUM('expense', 'loan');--> statement-breakpoint
ALTER TYPE "public"."suggestion_kind" ADD VALUE 'loan' BEFORE 'settlement';--> statement-breakpoint
ALTER TABLE "expenses" ADD COLUMN "kind" "expense_kind" DEFAULT 'expense' NOT NULL;