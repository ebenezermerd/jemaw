/**
 * Jemaw data model — all 8 tables from JEMAW_PLAN.md §7.
 *
 * Conventions:
 * - UUID primary keys via gen_random_uuid().
 * - Money stored as numeric(12,2). (Cents-integer math in the settle-up
 *   algorithm is a Phase 2 *computation* detail, not a storage change.)
 * - Telegram IDs are bigint in `bigint` mode (NOT number — IDs can exceed
 *   2^53). Serialize to string at the API boundary (see types.ts).
 * - All timestamps are timestamptz.
 */
import {
  pgTable,
  pgEnum,
  uuid,
  text,
  bigint,
  boolean,
  numeric,
  timestamp,
  jsonb,
  integer,
  unique,
} from "drizzle-orm/pg-core";

// ─── Enums ────────────────────────────────────────────────────────────
export const expenseSource = pgEnum("expense_source", [
  "manual",
  "ai_confirmed",
  "ai_edited",
]);

export const splitType = pgEnum("split_type", ["equal", "shares", "exact"]);

export const suggestionStatus = pgEnum("suggestion_status", [
  "pending",
  "confirmed",
  "edited",
  "dismissed",
]);

export const suggestionKind = pgEnum("suggestion_kind", [
  "expense",
  "settlement",
]);

export const aiTriggerType = pgEnum("ai_trigger_type", [
  "keyword",
  "command",
  "manual",
]);

export const aiRunStatus = pgEnum("ai_run_status", [
  "success",
  "parse_error",
  "api_error",
]);

export const paymentMethod = pgEnum("payment_method", [
  "cash",
  "bank",
  "telebirr",
  "other",
]);

export const memberRole = pgEnum("member_role", ["admin", "member"]);

// ─── groups ───────────────────────────────────────────────────────────
export const groups = pgTable("groups", {
  id: uuid("id").primaryKey().defaultRandom(),
  telegramChatId: bigint("telegram_chat_id", { mode: "bigint" })
    .notNull()
    .unique(),
  name: text("name").notNull(),
  defaultCurrency: text("default_currency").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  lastScanMessageId: bigint("last_scan_message_id", { mode: "bigint" }),
  pinnedMessageId: bigint("pinned_message_id", { mode: "bigint" }),
  settings: jsonb("settings").notNull().default({}),
});

// ─── members ──────────────────────────────────────────────────────────
export const members = pgTable(
  "members",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    groupId: uuid("group_id")
      .notNull()
      .references(() => groups.id),
    telegramUserId: bigint("telegram_user_id", { mode: "bigint" }).notNull(),
    displayName: text("display_name").notNull(),
    username: text("username"),
    role: memberRole("role").notNull().default("member"),
    isActive: boolean("is_active").notNull().default(true),
    joinedAt: timestamp("joined_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [unique().on(t.groupId, t.telegramUserId)],
);

// ─── ai_runs ──────────────────────────────────────────────────────────
// Declared before expenses/suggestions which reference it.
export const aiRuns = pgTable("ai_runs", {
  id: uuid("id").primaryKey().defaultRandom(),
  groupId: uuid("group_id")
    .notNull()
    .references(() => groups.id),
  triggeredByMemberId: uuid("triggered_by_member_id").references(
    () => members.id,
  ),
  triggerType: aiTriggerType("trigger_type").notNull(),
  fromMessageId: bigint("from_message_id", { mode: "bigint" }).notNull(),
  toMessageId: bigint("to_message_id", { mode: "bigint" }).notNull(),
  inputTokens: integer("input_tokens"),
  outputTokens: integer("output_tokens"),
  durationMs: integer("duration_ms"),
  status: aiRunStatus("status").notNull(),
  rawResponse: jsonb("raw_response"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

// ─── suggestions ──────────────────────────────────────────────────────
export const suggestions = pgTable("suggestions", {
  id: uuid("id").primaryKey().defaultRandom(),
  groupId: uuid("group_id")
    .notNull()
    .references(() => groups.id),
  aiRunId: uuid("ai_run_id")
    .notNull()
    .references(() => aiRuns.id),
  kind: suggestionKind("kind").notNull().default("expense"),
  confidence: numeric("confidence", { precision: 3, scale: 2 }).notNull(),
  description: text("description").notNull(),
  // Nullable: a vague settlement mention may not state an amount until edited.
  amount: numeric("amount", { precision: 12, scale: 2 }),
  payerMemberId: uuid("payer_member_id").references(() => members.id),
  // Settlement parties (kind = 'settlement').
  fromMemberId: uuid("from_member_id").references(() => members.id),
  toMemberId: uuid("to_member_id").references(() => members.id),
  splitType: splitType("split_type").notNull(),
  splitWith: jsonb("split_with").notNull(), // array of member ids
  shares: jsonb("shares"),
  evidenceMessageIds: jsonb("evidence_message_ids").notNull(),
  reasoning: text("reasoning").notNull(),
  status: suggestionStatus("status").notNull().default("pending"),
  resolvedAt: timestamp("resolved_at", { withTimezone: true }),
  resolvedByMemberId: uuid("resolved_by_member_id").references(() => members.id),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

// ─── expenses ─────────────────────────────────────────────────────────
export const expenses = pgTable("expenses", {
  id: uuid("id").primaryKey().defaultRandom(),
  groupId: uuid("group_id")
    .notNull()
    .references(() => groups.id),
  payerMemberId: uuid("payer_member_id")
    .notNull()
    .references(() => members.id),
  amount: numeric("amount", { precision: 12, scale: 2 }).notNull(),
  currency: text("currency").notNull(),
  description: text("description").notNull(),
  createdByMemberId: uuid("created_by_member_id")
    .notNull()
    .references(() => members.id),
  source: expenseSource("source").notNull(),
  sourceSuggestionId: uuid("source_suggestion_id").references(
    () => suggestions.id,
  ),
  occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  voidedAt: timestamp("voided_at", { withTimezone: true }),
});

// ─── expense_shares ───────────────────────────────────────────────────
export const expenseShares = pgTable("expense_shares", {
  id: uuid("id").primaryKey().defaultRandom(),
  expenseId: uuid("expense_id")
    .notNull()
    .references(() => expenses.id),
  memberId: uuid("member_id")
    .notNull()
    .references(() => members.id),
  shareAmount: numeric("share_amount", { precision: 12, scale: 2 }).notNull(),
});

// ─── settlements ──────────────────────────────────────────────────────
export const settlements = pgTable("settlements", {
  id: uuid("id").primaryKey().defaultRandom(),
  groupId: uuid("group_id")
    .notNull()
    .references(() => groups.id),
  fromMemberId: uuid("from_member_id")
    .notNull()
    .references(() => members.id),
  toMemberId: uuid("to_member_id")
    .notNull()
    .references(() => members.id),
  amount: numeric("amount", { precision: 12, scale: 2 }).notNull(),
  currency: text("currency").notNull(),
  method: paymentMethod("method").notNull().default("cash"),
  description: text("description"),
  // Selected expense ids this payment covers — metadata for context/history.
  expenseIds: jsonb("expense_ids"),
  occurredAt: timestamp("occurred_at", { withTimezone: true }),
  markedPaidAt: timestamp("marked_paid_at", { withTimezone: true }),
  markedPaidByMemberId: uuid("marked_paid_by_member_id").references(
    () => members.id,
  ),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

// ─── messages ─────────────────────────────────────────────────────────
// Rolling 30-day retention (sweep job is a later operational concern).
export const messages = pgTable(
  "messages",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    groupId: uuid("group_id")
      .notNull()
      .references(() => groups.id),
    telegramMessageId: bigint("telegram_message_id", {
      mode: "bigint",
    }).notNull(),
    senderTelegramUserId: bigint("sender_telegram_user_id", {
      mode: "bigint",
    }).notNull(),
    text: text("text").notNull(),
    sentAt: timestamp("sent_at", { withTimezone: true }).notNull(),
  },
  (t) => [unique().on(t.groupId, t.telegramMessageId)],
);

// ─── Inferred row types ───────────────────────────────────────────────
export type Group = typeof groups.$inferSelect;
export type NewGroup = typeof groups.$inferInsert;
export type Member = typeof members.$inferSelect;
export type NewMember = typeof members.$inferInsert;
export type Expense = typeof expenses.$inferSelect;
export type NewExpense = typeof expenses.$inferInsert;
export type ExpenseShare = typeof expenseShares.$inferSelect;
export type NewExpenseShare = typeof expenseShares.$inferInsert;
export type Settlement = typeof settlements.$inferSelect;
export type NewSettlement = typeof settlements.$inferInsert;
export type Suggestion = typeof suggestions.$inferSelect;
export type NewSuggestion = typeof suggestions.$inferInsert;
export type AiRun = typeof aiRuns.$inferSelect;
export type NewAiRun = typeof aiRuns.$inferInsert;
export type Message = typeof messages.$inferSelect;
export type NewMessage = typeof messages.$inferInsert;
