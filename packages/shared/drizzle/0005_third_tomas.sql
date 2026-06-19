CREATE TABLE "settlement_allocations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"settlement_id" uuid NOT NULL,
	"expense_id" uuid NOT NULL,
	"member_id" uuid NOT NULL,
	"allocated_amount" numeric(12, 2) NOT NULL
);
--> statement-breakpoint
ALTER TABLE "settlement_allocations" ADD CONSTRAINT "settlement_allocations_settlement_id_settlements_id_fk" FOREIGN KEY ("settlement_id") REFERENCES "public"."settlements"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "settlement_allocations" ADD CONSTRAINT "settlement_allocations_expense_id_expenses_id_fk" FOREIGN KEY ("expense_id") REFERENCES "public"."expenses"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "settlement_allocations" ADD CONSTRAINT "settlement_allocations_member_id_members_id_fk" FOREIGN KEY ("member_id") REFERENCES "public"."members"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expense_shares" ADD CONSTRAINT "expense_shares_expense_id_member_id_unique" UNIQUE("expense_id","member_id");--> statement-breakpoint
ALTER TABLE "expense_shares" ADD CONSTRAINT "share_amount_nonneg" CHECK ("expense_shares"."share_amount" >= 0);--> statement-breakpoint
ALTER TABLE "expenses" ADD CONSTRAINT "expense_amount_positive" CHECK ("expenses"."amount" > 0);--> statement-breakpoint
ALTER TABLE "settlements" ADD CONSTRAINT "settlement_amount_positive" CHECK ("settlements"."amount" > 0);