ALTER TABLE "announcements" ADD COLUMN IF NOT EXISTS "kind" text DEFAULT 'announcement' NOT NULL;--> statement-breakpoint
ALTER TABLE "announcements" ADD COLUMN IF NOT EXISTS "release" jsonb;
