/**
 * Data-access layer. Thin typed queries over Drizzle so routes and Telegram
 * handlers share one set of operations.
 */
import { and, eq, desc, isNull } from "drizzle-orm";
import type { Db } from "./db.js";
import {
  groups,
  members,
  expenses,
  expenseShares,
  settlements,
  messages,
  type Group,
  type Member,
  type Settlement,
} from "@jemaw/shared/schema";

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

export async function addManualMember(
  db: Db,
  groupId: string,
  displayName: string,
  telegramUserId: bigint | null,
): Promise<Member> {
  // Manual members may have no Telegram id yet; use a negative synthetic id
  // derived from time-free randomness is not available — use 0-based sentinel
  // via a unique-per-group placeholder. We require a telegramUserId in v1
  // manual add to keep the unique constraint satisfied; callers pass one or a
  // synthetic negative id chosen by the route.
  const tid = telegramUserId ?? -BigInt(Math.floor(performanceNowSafe()));
  const inserted = await db
    .insert(members)
    .values({ groupId, telegramUserId: tid, displayName, username: null })
    .returning();
  return inserted[0]!;
}

// performance.now is allowed; Date.now is avoided per environment constraints
// elsewhere, but synthetic member ids only need within-process uniqueness.
function performanceNowSafe(): number {
  return Math.floor(performance.now() * 1000);
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
  const rows = await db
    .select()
    .from(expenses)
    .where(and(eq(expenses.groupId, groupId), eq(expenses.id, expenseId)))
    .limit(1);
  if (!rows[0]) return "not_found";
  if (rows[0].voidedAt) return "already_voided";
  await db
    .update(expenses)
    .set({ voidedAt: when })
    .where(eq(expenses.id, expenseId));
  return "ok";
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

export async function createSettlement(
  db: Db,
  values: typeof settlements.$inferInsert,
): Promise<Settlement> {
  const rows = await db.insert(settlements).values(values).returning();
  return rows[0]!;
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
