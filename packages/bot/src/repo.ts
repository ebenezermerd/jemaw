/**
 * Data-access layer. Thin typed queries over Drizzle so routes and Telegram
 * handlers share one set of operations.
 */
import { and, eq, desc, gt, isNull, inArray } from "drizzle-orm";
import type { Db } from "./db.js";
import {
  groups,
  members,
  expenses,
  expenseShares,
  settlements,
  settlementAllocations,
  messages,
  aiRuns,
  suggestions,
  type Group,
  type Member,
  type Settlement,
  type SettlementAllocation,
  type Message,
  type AiRun,
  type Suggestion,
} from "@jemaw/shared/schema";
import { centsToDecimal, decimalToCents } from "@jemaw/shared/types";

// ─── Groups ───────────────────────────────────────────────────────────
export async function upsertGroup(
  db: Db,
  telegramChatId: bigint,
  name: string,
  defaultCurrency: string,
): Promise<Group> {
  const existing = await db
    .select()
    .from(groups)
    .where(eq(groups.telegramChatId, telegramChatId))
    .limit(1);
  if (existing[0]) {
    if (existing[0].name !== name) {
      await db.update(groups).set({ name }).where(eq(groups.id, existing[0].id));
      return { ...existing[0], name };
    }
    return existing[0];
  }
  const inserted = await db
    .insert(groups)
    .values({ telegramChatId, name, defaultCurrency })
    .returning();
  return inserted[0]!;
}

export async function getGroupById(db: Db, id: string): Promise<Group | null> {
  const rows = await db.select().from(groups).where(eq(groups.id, id)).limit(1);
  return rows[0] ?? null;
}

/** Shallow-merge keys into groups.settings without clobbering other keys. */
export async function mergeGroupSettings(
  db: Db,
  groupId: string,
  patch: Record<string, unknown>,
): Promise<void> {
  const group = await getGroupById(db, groupId);
  if (!group) return;
  const next = { ...(group.settings as Record<string, unknown>), ...patch };
  await db.update(groups).set({ settings: next }).where(eq(groups.id, groupId));
}

/** Count of non-voided expenses in a group (cheap stamp input). */
export async function countLiveExpenses(
  db: Db,
  groupId: string,
): Promise<number> {
  const rows = await db
    .select({ id: expenses.id })
    .from(expenses)
    .where(and(eq(expenses.groupId, groupId), isNull(expenses.voidedAt)));
  return rows.length;
}

/** Count of settlements in a group. */
export async function countSettlements(
  db: Db,
  groupId: string,
): Promise<number> {
  const rows = await db
    .select({ id: settlements.id })
    .from(settlements)
    .where(eq(settlements.groupId, groupId));
  return rows.length;
}

export async function setPinnedMessageId(
  db: Db,
  groupId: string,
  pinnedMessageId: bigint | null,
): Promise<void> {
  await db
    .update(groups)
    .set({ pinnedMessageId })
    .where(eq(groups.id, groupId));
}

export async function updateGroupCurrency(
  db: Db,
  groupId: string,
  defaultCurrency: string,
): Promise<Group | null> {
  const rows = await db
    .update(groups)
    .set({ defaultCurrency })
    .where(eq(groups.id, groupId))
    .returning();
  return rows[0] ?? null;
}

// ─── Members ──────────────────────────────────────────────────────────
export async function upsertMember(
  db: Db,
  groupId: string,
  telegramUserId: bigint,
  displayName: string,
  username: string | null,
): Promise<Member> {
  const existing = await db
    .select()
    .from(members)
    .where(
      and(
        eq(members.groupId, groupId),
        eq(members.telegramUserId, telegramUserId),
      ),
    )
    .limit(1);
  if (existing[0]) return existing[0];
  const inserted = await db
    .insert(members)
    .values({ groupId, telegramUserId, displayName, username })
    .returning();
  return inserted[0]!;
}

/**
 * Promote a group's Telegram admins to the `admin` role. Promote-only: it never
 * demotes, so manual in-app promotions stick across syncs and a Telegram admin
 * is always at least an admin. Callers pass only a list they actually fetched
 * (never an empty list from a failed read).
 */
export async function syncMemberRoles(
  db: Db,
  groupId: string,
  adminTelegramIds: bigint[],
): Promise<void> {
  if (adminTelegramIds.length === 0) return;
  await db
    .update(members)
    .set({ role: "admin" })
    .where(
      and(
        eq(members.groupId, groupId),
        inArray(members.telegramUserId, adminTelegramIds),
      ),
    );
}

/** Promote a single member to admin (used for the /start fallback). */
export async function setMemberRole(
  db: Db,
  groupId: string,
  telegramUserId: bigint,
  role: "admin" | "member",
): Promise<void> {
  await db
    .update(members)
    .set({ role })
    .where(
      and(
        eq(members.groupId, groupId),
        eq(members.telegramUserId, telegramUserId),
      ),
    );
}

/** Set a member's role by member id; returns the updated row (or null). */
export async function setMemberRoleById(
  db: Db,
  groupId: string,
  memberId: string,
  role: "admin" | "member",
): Promise<Member | null> {
  const rows = await db
    .update(members)
    .set({ role })
    .where(and(eq(members.groupId, groupId), eq(members.id, memberId)))
    .returning();
  return rows[0] ?? null;
}

/** Set a member's primary flag (default-included in splits). Independent of role. */
export async function setMemberPrimaryById(
  db: Db,
  groupId: string,
  memberId: string,
  isPrimary: boolean,
): Promise<Member | null> {
  const rows = await db
    .update(members)
    .set({ isPrimary })
    .where(and(eq(members.groupId, groupId), eq(members.id, memberId)))
    .returning();
  return rows[0] ?? null;
}

/** How many active admins a group currently has (to block removing the last). */
export async function countAdmins(db: Db, groupId: string): Promise<number> {
  const rows = await db
    .select({ id: members.id })
    .from(members)
    .where(
      and(
        eq(members.groupId, groupId),
        eq(members.role, "admin"),
        eq(members.isActive, true),
      ),
    );
  return rows.length;
}

export async function addManualMember(
  db: Db,
  groupId: string,
  displayName: string,
  telegramUserId: bigint | null,
): Promise<Member> {
  if (telegramUserId !== null) {
    const inserted = await db
      .insert(members)
      .values({ groupId, telegramUserId, displayName, username: null })
      .returning();
    return inserted[0]!;
  }
  // No Telegram id: generate a random large-negative synthetic id and retry on
  // unique(group_id, telegram_user_id) collision. Correctness rests on the DB
  // constraint, not on the random value being globally unique.
  for (let attempt = 0; attempt < 10; attempt++) {
    const tid = -(
      BigInt(Date.now()) * 1_000_000n +
      BigInt(Math.floor(Math.random() * 1_000_000))
    );
    try {
      const inserted = await db
        .insert(members)
        .values({ groupId, telegramUserId: tid, displayName, username: null })
        .returning();
      return inserted[0]!;
    } catch (err) {
      // Postgres unique-violation code 23505 — retry with a new id.
      if ((err as { code?: string }).code === "23505") continue;
      throw err;
    }
  }
  throw new Error("Failed to generate a unique synthetic member id after 10 attempts");
}

export async function renameMember(
  db: Db,
  groupId: string,
  memberId: string,
  displayName: string,
): Promise<Member | null> {
  const rows = await db
    .update(members)
    .set({ displayName })
    .where(and(eq(members.groupId, groupId), eq(members.id, memberId)))
    .returning();
  return rows[0] ?? null;
}

export async function listMembers(
  db: Db,
  groupId: string,
): Promise<Member[]> {
  return db
    .select()
    .from(members)
    .where(eq(members.groupId, groupId))
    .orderBy(members.joinedAt);
}

export async function findMemberByTelegramId(
  db: Db,
  groupId: string,
  telegramUserId: bigint,
): Promise<Member | null> {
  const rows = await db
    .select()
    .from(members)
    .where(
      and(
        eq(members.groupId, groupId),
        eq(members.telegramUserId, telegramUserId),
      ),
    )
    .limit(1);
  return rows[0] ?? null;
}

// ─── Expenses ─────────────────────────────────────────────────────────
export interface ExpenseWithShares {
  expense: typeof expenses.$inferSelect;
  shares: (typeof expenseShares.$inferSelect)[];
}

export async function createExpenseWithShares(
  db: Db,
  values: typeof expenses.$inferInsert,
  shareRows: Omit<typeof expenseShares.$inferInsert, "expenseId">[],
): Promise<ExpenseWithShares> {
  return db.transaction(async (tx) => {
    const ins = await tx.insert(expenses).values(values).returning();
    const expense = ins[0]!;
    const shares = await tx
      .insert(expenseShares)
      .values(shareRows.map((s) => ({ ...s, expenseId: expense.id })))
      .returning();
    return { expense, shares };
  });
}

export async function listLiveExpenses(
  db: Db,
  groupId: string,
): Promise<ExpenseWithShares[]> {
  const exp = await db
    .select()
    .from(expenses)
    .where(and(eq(expenses.groupId, groupId), isNull(expenses.voidedAt)))
    .orderBy(desc(expenses.occurredAt), desc(expenses.createdAt));
  if (exp.length === 0) return [];
  const result: ExpenseWithShares[] = [];
  for (const e of exp) {
    const shares = await db
      .select()
      .from(expenseShares)
      .where(eq(expenseShares.expenseId, e.id));
    result.push({ expense: e, shares });
  }
  return result;
}

export async function getExpense(
  db: Db,
  groupId: string,
  expenseId: string,
): Promise<ExpenseWithShares | null> {
  const rows = await db
    .select()
    .from(expenses)
    .where(and(eq(expenses.groupId, groupId), eq(expenses.id, expenseId)))
    .limit(1);
  if (!rows[0]) return null;
  const shares = await db
    .select()
    .from(expenseShares)
    .where(eq(expenseShares.expenseId, expenseId));
  return { expense: rows[0], shares };
}

export async function groupHasExpenses(
  db: Db,
  groupId: string,
): Promise<boolean> {
  const rows = await db
    .select({ id: expenses.id })
    .from(expenses)
    .where(eq(expenses.groupId, groupId))
    .limit(1);
  return rows.length > 0;
}

/** Replace an expense's fields + shares atomically. Returns null if missing. */
export async function updateExpenseWithShares(
  db: Db,
  groupId: string,
  expenseId: string,
  values: Partial<typeof expenses.$inferInsert>,
  shareRows: Omit<typeof expenseShares.$inferInsert, "expenseId">[],
): Promise<ExpenseWithShares | null> {
  return db.transaction(async (tx) => {
    const existing = await tx
      .select()
      .from(expenses)
      .where(and(eq(expenses.groupId, groupId), eq(expenses.id, expenseId)))
      .limit(1);
    if (!existing[0]) return null;
    if (existing[0].voidedAt) throw new Error("cannot edit a voided expense");

    await tx
      .update(expenses)
      .set(values)
      .where(eq(expenses.id, expenseId));
    await tx.delete(expenseShares).where(eq(expenseShares.expenseId, expenseId));
    const shares = await tx
      .insert(expenseShares)
      .values(shareRows.map((s) => ({ ...s, expenseId })))
      .returning();
    const updated = await tx
      .select()
      .from(expenses)
      .where(eq(expenses.id, expenseId))
      .limit(1);
    return { expense: updated[0]!, shares };
  });
}

/** Soft-delete an expense. Returns "ok" | "not_found" | "already_voided". */
export async function voidExpense(
  db: Db,
  groupId: string,
  expenseId: string,
  when: Date,
): Promise<"ok" | "not_found" | "already_voided"> {
  return db.transaction(async (tx) => {
    const rows = await tx
      .select()
      .from(expenses)
      .where(and(eq(expenses.groupId, groupId), eq(expenses.id, expenseId)))
      .limit(1);
    if (!rows[0]) return "not_found";
    if (rows[0].voidedAt) return "already_voided";

    const affected = await tx
      .select({ settlementId: settlementAllocations.settlementId })
      .from(settlementAllocations)
      .innerJoin(settlements, eq(settlementAllocations.settlementId, settlements.id))
      .where(
        and(
          eq(settlementAllocations.expenseId, expenseId),
          eq(settlements.groupId, groupId),
        ),
      );
    const affectedSettlementIds = [
      ...new Set(affected.map((a) => a.settlementId)),
    ];

    await tx
      .delete(settlementAllocations)
      .where(eq(settlementAllocations.expenseId, expenseId));

    for (const settlementId of affectedSettlementIds) {
      const remaining = await tx
        .select()
        .from(settlementAllocations)
        .where(eq(settlementAllocations.settlementId, settlementId));

      if (remaining.length === 0) {
        await tx
          .delete(settlements)
          .where(and(eq(settlements.groupId, groupId), eq(settlements.id, settlementId)));
        continue;
      }

      const amountCents = remaining.reduce(
        (sum, a) => sum + decimalToCents(a.allocatedAmount),
        0,
      );
      const expenseIds = [...new Set(remaining.map((a) => a.expenseId))];
      await tx
        .update(settlements)
        .set({ amount: centsToDecimal(amountCents), expenseIds })
        .where(and(eq(settlements.groupId, groupId), eq(settlements.id, settlementId)));
    }

    await tx
      .update(expenses)
      .set({ voidedAt: when })
      .where(eq(expenses.id, expenseId));
    return "ok";
  });
}

// ─── Settlements ──────────────────────────────────────────────────────
export async function listSettlements(
  db: Db,
  groupId: string,
): Promise<Settlement[]> {
  return db
    .select()
    .from(settlements)
    .where(eq(settlements.groupId, groupId))
    .orderBy(desc(settlements.createdAt));
}

export async function getSettlement(
  db: Db,
  groupId: string,
  settlementId: string,
): Promise<Settlement | null> {
  const rows = await db
    .select()
    .from(settlements)
    .where(and(eq(settlements.groupId, groupId), eq(settlements.id, settlementId)))
    .limit(1);
  return rows[0] ?? null;
}

export async function createSettlement(
  db: Db,
  values: typeof settlements.$inferInsert,
): Promise<Settlement> {
  const rows = await db.insert(settlements).values(values).returning();
  return rows[0]!;
}

export interface AllocationInput {
  expenseId: string;
  memberId: string;
  allocatedAmount: string; // decimal string
}

/** Transactionally insert a settlement + its per-expense allocation rows. */
export async function createSettlementWithAllocations(
  db: Db,
  values: typeof settlements.$inferInsert,
  allocationInputs: AllocationInput[],
): Promise<{ settlement: Settlement; allocations: SettlementAllocation[] }> {
  return db.transaction(async (tx) => {
    // Populate expenseIds JSONB from allocations for back-compat / history.
    const expenseIds = [...new Set(allocationInputs.map((a) => a.expenseId))];
    const ins = await tx
      .insert(settlements)
      .values({ ...values, expenseIds })
      .returning();
    const settlement = ins[0]!;
    const allocations = await tx
      .insert(settlementAllocations)
      .values(
        allocationInputs.map((a) => ({
          settlementId: settlement.id,
          expenseId: a.expenseId,
          memberId: a.memberId,
          allocatedAmount: a.allocatedAmount,
        })),
      )
      .returning();
    return { settlement, allocations };
  });
}

/** Delete a settlement and its allocation rows in one transaction. */
export async function deleteSettlement(
  db: Db,
  groupId: string,
  settlementId: string,
): Promise<"ok" | "not_found"> {
  return db.transaction(async (tx) => {
    const rows = await tx
      .select()
      .from(settlements)
      .where(and(eq(settlements.groupId, groupId), eq(settlements.id, settlementId)))
      .limit(1);
    if (!rows[0]) return "not_found";
    await tx
      .delete(settlementAllocations)
      .where(eq(settlementAllocations.settlementId, settlementId));
    await tx
      .delete(settlements)
      .where(and(eq(settlements.groupId, groupId), eq(settlements.id, settlementId)));
    return "ok";
  });
}

/** All allocation rows for settlements belonging to a group. */
export async function listSettlementAllocations(
  db: Db,
  groupId: string,
): Promise<SettlementAllocation[]> {
  const rows = await db
    .select({ sa: settlementAllocations })
    .from(settlementAllocations)
    .innerJoin(settlements, eq(settlementAllocations.settlementId, settlements.id))
    .where(eq(settlements.groupId, groupId));
  return rows.map((r) => r.sa);
}

// ─── Messages ─────────────────────────────────────────────────────────
export async function captureMessage(
  db: Db,
  groupId: string,
  telegramMessageId: bigint,
  senderTelegramUserId: bigint,
  text: string,
  sentAt: Date,
): Promise<void> {
  await db
    .insert(messages)
    .values({
      groupId,
      telegramMessageId,
      senderTelegramUserId,
      text,
      sentAt,
    })
    .onConflictDoNothing();
}

/** Recent messages for a scan: after `sinceMessageId` (if any), up to `limit`. */
export async function recentMessages(
  db: Db,
  groupId: string,
  sinceMessageId: bigint | null,
  limit: number,
): Promise<Message[]> {
  const where = sinceMessageId
    ? and(
        eq(messages.groupId, groupId),
        gt(messages.telegramMessageId, sinceMessageId),
      )
    : eq(messages.groupId, groupId);
  const rows = await db
    .select()
    .from(messages)
    .where(where)
    .orderBy(desc(messages.telegramMessageId))
    .limit(limit);
  // Return chronological (oldest first) for the prompt.
  return rows.reverse();
}

/**
 * Trailing window: the last `limit` messages regardless of last-scan pointer.
 * Used by scans so every "jemaw" re-examines recent context (a one-message
 * window finds nothing). De-duplication of already-known expenses is handled by
 * the prompt's "recently confirmed expenses" list, not by truncating the window.
 */
export async function lastNMessages(
  db: Db,
  groupId: string,
  limit: number,
): Promise<Message[]> {
  const rows = await db
    .select()
    .from(messages)
    .where(eq(messages.groupId, groupId))
    .orderBy(desc(messages.telegramMessageId))
    .limit(limit);
  return rows.reverse();
}

/**
 * True when the group has chat messages newer than the last scan pointer,
 * meaning a scan would have fresh context to examine.
 */
export async function groupHasNewMessages(
  db: Db,
  groupId: string,
): Promise<boolean> {
  const g = await getGroupById(db, groupId);
  if (!g?.lastScanMessageId) return false;
  const rows = await db
    .select({ id: messages.id })
    .from(messages)
    .where(
      and(
        eq(messages.groupId, groupId),
        gt(messages.telegramMessageId, g.lastScanMessageId),
      ),
    )
    .limit(1);
  return rows.length > 0;
}

export async function setLastScanMessageId(
  db: Db,
  groupId: string,
  messageId: bigint,
): Promise<void> {
  await db
    .update(groups)
    .set({ lastScanMessageId: messageId })
    .where(eq(groups.id, groupId));
}

// ─── AI runs & suggestions ────────────────────────────────────────────
export async function createAiRun(
  db: Db,
  values: typeof aiRuns.$inferInsert,
): Promise<AiRun> {
  const rows = await db.insert(aiRuns).values(values).returning();
  return rows[0]!;
}

export async function insertSuggestions(
  db: Db,
  rows: (typeof suggestions.$inferInsert)[],
): Promise<Suggestion[]> {
  if (rows.length === 0) return [];
  return db.insert(suggestions).values(rows).returning();
}

/**
 * The set of chat message ids already "spoken for" by any existing suggestion
 * in this group — confirmed, dismissed, edited, or still pending. A new scan
 * suggestion whose evidence overlaps this set is a duplicate and is skipped.
 */
export async function handledEvidenceMessageIds(
  db: Db,
  groupId: string,
): Promise<Set<number>> {
  const rows = await db
    .select({ evidence: suggestions.evidenceMessageIds })
    .from(suggestions)
    .where(eq(suggestions.groupId, groupId));
  const set = new Set<number>();
  for (const r of rows) {
    for (const id of (r.evidence as number[]) ?? []) set.add(id);
  }
  return set;
}

export async function listPendingSuggestions(
  db: Db,
  groupId: string,
): Promise<Suggestion[]> {
  return db
    .select()
    .from(suggestions)
    .where(
      and(
        eq(suggestions.groupId, groupId),
        eq(suggestions.status, "pending"),
      ),
    )
    .orderBy(desc(suggestions.confidence));
}

export async function countPendingSuggestions(
  db: Db,
  groupId: string,
): Promise<number> {
  const rows = await listPendingSuggestions(db, groupId);
  return rows.length;
}

export async function getSuggestion(
  db: Db,
  groupId: string,
  suggestionId: string,
): Promise<Suggestion | null> {
  const rows = await db
    .select()
    .from(suggestions)
    .where(
      and(eq(suggestions.groupId, groupId), eq(suggestions.id, suggestionId)),
    )
    .limit(1);
  return rows[0] ?? null;
}

export async function resolveSuggestion(
  db: Db,
  suggestionId: string,
  status: "confirmed" | "edited" | "dismissed",
  resolvedByMemberId: string,
  when: Date,
): Promise<void> {
  await db
    .update(suggestions)
    .set({ status, resolvedByMemberId, resolvedAt: when })
    .where(eq(suggestions.id, suggestionId));
}

/**
 * Clear a group's ledger: expenses, shares, settlements, suggestions, messages,
 * and ai_runs. Keeps the group row and its members. Ordered to respect foreign
 * keys (children before parents) and run in one transaction so it's all-or-
 * nothing. Also resets the group's last-scan pointer so a fresh scan re-examines
 * the (now empty) chat without tripping over a stale message id.
 */
export async function resetGroupData(db: Db, groupId: string): Promise<void> {
  await db.transaction(async (tx) => {
    const groupExpenseIds = tx
      .select({ id: expenses.id })
      .from(expenses)
      .where(eq(expenses.groupId, groupId));
    const groupSettlementIds = tx
      .select({ id: settlements.id })
      .from(settlements)
      .where(eq(settlements.groupId, groupId));

    // Delete allocations first (child of both settlements and expenses).
    await tx.delete(settlementAllocations).where(
      inArray(settlementAllocations.settlementId, groupSettlementIds),
    );
    // expense_shares has no group_id — delete via parent expenses.
    await tx.delete(expenseShares).where(
      inArray(expenseShares.expenseId, groupExpenseIds),
    );
    await tx.delete(settlements).where(eq(settlements.groupId, groupId));
    await tx.delete(suggestions).where(eq(suggestions.groupId, groupId));
    await tx.delete(expenses).where(eq(expenses.groupId, groupId));
    await tx.delete(aiRuns).where(eq(aiRuns.groupId, groupId));
    await tx.delete(messages).where(eq(messages.groupId, groupId));
    await tx
      .update(groups)
      .set({ lastScanMessageId: null })
      .where(eq(groups.id, groupId));
  });
}
