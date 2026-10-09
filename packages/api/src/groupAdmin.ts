/**
 * Group management from the console: rename, currency, member roles, bot
 * settings, access (AI pause, suspension, daily AI limit) and clearing the
 * ledger. Groups themselves are never deleted from here.
 */
import { and, eq, inArray, ne, sql } from "drizzle-orm";
import type { Db } from "./db.js";
import {
  groups,
  members,
  expenses,
  expenseShares,
  settlements,
  settlementAllocations,
  suggestions,
  aiRuns,
  messages,
  type Group,
  type Member,
} from "@jemaw/shared/schema";
import { applyHumorPatch, parseHumorSettings, toHumorSettingsDto } from "@jemaw/shared/humor";
import { parseGroupAccess, type GroupAccessV1 } from "@jemaw/shared/groupAccess";
import type { HumorSettingsDto } from "@jemaw/shared/types";

export async function getGroup(db: Db, groupId: string): Promise<Group | null> {
  const [g] = await db.select().from(groups).where(eq(groups.id, groupId));
  return g ?? null;
}

export async function groupHasAnyExpense(db: Db, groupId: string): Promise<boolean> {
  const rows = await db.select({ id: expenses.id }).from(expenses).where(eq(expenses.groupId, groupId)).limit(1);
  return rows.length > 0;
}

export async function updateGroupFields(
  db: Db,
  groupId: string,
  patch: { name?: string; defaultCurrency?: string },
): Promise<void> {
  if (Object.keys(patch).length === 0) return;
  await db.update(groups).set(patch).where(eq(groups.id, groupId));
}

/** Merge a humor patch into groups.settings.humor, keeping other settings keys. */
export async function patchGroupHumor(
  db: Db,
  group: Group,
  body: Record<string, unknown>,
  now: Date,
): Promise<HumorSettingsDto | { error: string }> {
  const settings = (group.settings as Record<string, unknown> | null) ?? {};
  const next = applyHumorPatch(parseHumorSettings(settings.humor), body, { now });
  if ("error" in next) return next;
  // jsonb_set on the live row so a concurrent bot write to another key survives.
  await db
    .update(groups)
    .set({
      settings: sql`jsonb_set(coalesce(${groups.settings}, '{}'::jsonb), '{humor}', ${JSON.stringify(next)}::jsonb)`,
    })
    .where(eq(groups.id, group.id));
  return toHumorSettingsDto(parseHumorSettings(next));
}

export type MemberPatchResult =
  | { ok: true; member: Member }
  | { ok: false; status: 404 | 409; error: string };

/** Change a member's role, active flag or name. Keeps at least one active admin. */
export async function updateGroupMember(
  db: Db,
  groupId: string,
  memberId: string,
  patch: { role?: "admin" | "member"; isActive?: boolean; displayName?: string },
): Promise<MemberPatchResult> {
  const [m] = await db
    .select()
    .from(members)
    .where(and(eq(members.id, memberId), eq(members.groupId, groupId)));
  if (!m) return { ok: false, status: 404, error: "member not found" };
  const losesAdmin =
    m.role === "admin" && m.isActive && (patch.role === "member" || patch.isActive === false);
  if (losesAdmin) {
    const others = await db
      .select({ id: members.id })
      .from(members)
      .where(
        and(
          eq(members.groupId, groupId),
          eq(members.role, "admin"),
          eq(members.isActive, true),
          ne(members.id, memberId),
        ),
      )
      .limit(1);
    if (others.length === 0) {
      return { ok: false, status: 409, error: "a group needs at least one active admin" };
    }
  }
  // Removing or restoring also takes them out of (or back into) default splits.
  const set = patch.isActive === undefined ? patch : { ...patch, isPrimary: patch.isActive };
  const [updated] = await db.update(members).set(set).where(eq(members.id, memberId)).returning();
  return { ok: true, member: updated! };
}

/**
 * Clear a group's ledger but keep the group and its members, like the bot's
 * resetGroupData. Returns rows deleted per table.
 */
export async function resetGroupLedger(db: Db, groupId: string): Promise<Record<string, number>> {
  return db.transaction(async (tx) => {
    const counts = await deleteLedgerRows(tx as unknown as Db, groupId);
    await tx.update(groups).set({ lastScanMessageId: null }).where(eq(groups.id, groupId));
    return counts;
  });
}

/** Merge an access change into groups.settings.access, keeping other keys. */
export async function setGroupAccess(
  db: Db,
  group: Group,
  patch: Partial<Pick<GroupAccessV1, "status" | "until" | "reason" | "aiDailyLimit">>,
  meta: { by: string; now: Date },
): Promise<GroupAccessV1> {
  const current = parseGroupAccess((group.settings as Record<string, unknown> | null)?.access, meta.now);
  const next: GroupAccessV1 = { ...current, ...patch, updatedAt: meta.now.toISOString(), updatedBy: meta.by };
  // Lifting a pause clears its end time and reason.
  if (next.status === "active") {
    next.until = null;
    if (patch.reason === undefined) next.reason = null;
  }
  await db
    .update(groups)
    .set({
      settings: sql`jsonb_set(coalesce(${groups.settings}, '{}'::jsonb), '{access}', ${JSON.stringify(next)}::jsonb)`,
    })
    .where(eq(groups.id, group.id));
  return parseGroupAccess(next, meta.now);
}

async function deleteLedgerRows(t: Db, groupId: string): Promise<Record<string, number>> {
  const expenseIds = t.select({ id: expenses.id }).from(expenses).where(eq(expenses.groupId, groupId));
  const settlementIds = t.select({ id: settlements.id }).from(settlements).where(eq(settlements.groupId, groupId));
  const n = (rows: unknown[]) => rows.length;
  const counts: Record<string, number> = {};
  // Allocations hang off both settlements and expenses.
  counts.settlement_allocations = n(
    await t
      .delete(settlementAllocations)
      .where(
        sql`${settlementAllocations.settlementId} in ${settlementIds} or ${settlementAllocations.expenseId} in ${expenseIds}`,
      )
      .returning({ id: settlementAllocations.id }),
  );
  counts.expense_shares = n(
    await t.delete(expenseShares).where(inArray(expenseShares.expenseId, expenseIds)).returning({ id: expenseShares.id }),
  );
  counts.settlements = n(await t.delete(settlements).where(eq(settlements.groupId, groupId)).returning({ id: settlements.id }));
  counts.expenses = n(await t.delete(expenses).where(eq(expenses.groupId, groupId)).returning({ id: expenses.id }));
  // Suggestions after expenses: expenses.source_suggestion_id points at them.
  counts.suggestions = n(await t.delete(suggestions).where(eq(suggestions.groupId, groupId)).returning({ id: suggestions.id }));
  counts.ai_runs = n(await t.delete(aiRuns).where(eq(aiRuns.groupId, groupId)).returning({ id: aiRuns.id }));
  counts.messages = n(await t.delete(messages).where(eq(messages.groupId, groupId)).returning({ id: messages.id }));
  return counts;
}
