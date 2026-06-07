CREATE TYPE "public"."member_role" AS ENUM('admin', 'member');--> statement-breakpoint
ALTER TABLE "members" ADD COLUMN "role" "member_role" DEFAULT 'member' NOT NULL;