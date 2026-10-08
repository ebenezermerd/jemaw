/**
 * Ledger views for the admin console, computed with the same pure math the
 * bot uses (@jemaw/shared/ledger), so balances and settled states match what
 * members see in the mini app.
 */
import { and, count, desc, eq, ilike, inArray, isNull, or, type SQL } from "drizzle-orm";
import type { Db } from "./db.js";
import {
  groups,
  members,
  expenses,
  expenseShares,
  settlements,
  settlementAllocations,
  type Member,
} from "@jemaw/shared/schema";
import {
  centsToDecimal,
  decimalToCents,
  telegramIdToString,
  type AdminExpenseDto,
  type AdminExpensePageDto,
  type AdminGroupDetailDto,
  type AdminGroupDto,
  type AdminGroupMemberDto,
  type AdminSettlementDto,
  type AdminUserMembershipDto,
} from "@jemaw/shared/types";
import {
  computeBalances,
  computePairwiseTransfers,
  deriveExpenseDebts,
  isExpenseCovered,
  type AllocationForDebt,
  type ExpenseForDebt,
} from "@jemaw/shared/ledger";

/** Manual members get synthetic negative ids instead of a Telegram account. */
export const isManualId = (id: bigint) => id < 0n;

interface LiveExpense {
  id: string;
  payerMemberId: string;
  amountCents: number;
  kind: "expense" | "loan";
  occurredAt: Date;
  shares: { memberId: string; shareCents: number }[];
}

export interface GroupLedger {
  group: typeof groups.$inferSelect;
  members: Member[];
  expenses: LiveExpense[];
  settlements: (typeof settlements.$inferSelect)[];
  nets: Map<string, number>;
  coveredExpenseIds: Set<string>;
  transfers: { fromMemberId: string; toMemberId: string; amountCents: number }[];
}

export async function loadGroupLedger(db: Db, groupId: string): Promise<GroupLedger | null> {
  const [group] = await db.select().from(groups).where(eq(groups.id, groupId));
  if (!group) return null;
  const memberRows = await db.select().from(members).where(eq(members.groupId, groupId));
  const expenseRows = await db
    .select()
    .from(expenses)
    .where(and(eq(expenses.groupId, groupId), isNull(expenses.voidedAt)));
  const ids = expenseRows.map((e) => e.id);
  const shareRows = ids.length
    ? await db.select().from(expenseShares).where(inArray(expenseShares.expenseId, ids))
    : [];
  const settlementRows = await db
    .select()
    .from(settlements)
    .where(eq(settlements.groupId, groupId))
    .orderBy(desc(settlements.createdAt));
  const allocationRows = settlementRows.length
    ? await db
        .select()
        .from(settlementAllocations)
        .where(inArray(settlementAllocations.settlementId, settlementRows.map((s) => s.id)))
    : [];

  const sharesByExpense = new Map<string, { memberId: string; shareCents: number }[]>();
  for (const s of shareRows) {
    const list = sharesByExpense.get(s.expenseId) ?? [];
    list.push({ memberId: s.memberId, shareCents: decimalToCents(s.shareAmount) });
    sharesByExpense.set(s.expenseId, list);
  }
  const live: LiveExpense[] = expenseRows.map((e) => ({
    id: e.id,
    payerMemberId: e.payerMemberId,
    amountCents: decimalToCents(e.amount),
    kind: e.kind,
    occurredAt: e.occurredAt,
    shares: sharesByExpense.get(e.id) ?? [],
  }));

  const nets = computeBalances(
    memberRows.map((m) => m.id),
    live.map((e) => ({ payerMemberId: e.payerMemberId, shares: e.shares })),
    settlementRows.map((s) => ({
      fromMemberId: s.fromMemberId,
      toMemberId: s.toMemberId,
      amountCents: decimalToCents(s.amount),
    })),
  );
  const forDebt: ExpenseForDebt[] = live.map((e) => ({
    expenseId: e.id,
    payerMemberId: e.payerMemberId,
    occurredAt: e.occurredAt,
    shares: e.shares,
  }));
  const allocations: AllocationForDebt[] = allocationRows.map((a) => ({
    expenseId: a.expenseId,
    memberId: a.memberId,
    allocatedCents: decimalToCents(a.allocatedAmount),
  }));

  return {
    group,
    members: memberRows,
    expenses: live,
    settlements: settlementRows,
    nets: new Map(nets.map((n) => [n.memberId, n.netCents])),
    coveredExpenseIds: new Set(
      forDebt.filter((e) => isExpenseCovered(e, allocations)).map((e) => e.expenseId),
    ),
    transfers: computePairwiseTransfers(deriveExpenseDebts(forDebt, allocations)),
  };
}

interface MemberTotals {
  paidCents: number;
  shareCents: number;
  expenseCount: number;
}

function memberTotals(ledger: GroupLedger): Map<string, MemberTotals> {
  const totals = new Map<string, MemberTotals>();
  const get = (id: string) => {
    let t = totals.get(id);
    if (!t) totals.set(id, (t = { paidCents: 0, shareCents: 0, expenseCount: 0 }));
    return t;
  };
  for (const e of ledger.expenses) {
    // Loans move money but are not spending, like the bot's stats.
    if (e.kind === "loan") continue;
    const payer = get(e.payerMemberId);
    payer.paidCents += e.amountCents;
    payer.expenseCount += 1;
    for (const s of e.shares) get(s.memberId).shareCents += s.shareCents;
  }
  return totals;
}

export function groupSummary(ledger: GroupLedger): AdminGroupDto {
  const spend = ledger.expenses
    .filter((e) => e.kind !== "loan")
    .reduce((sum, e) => sum + e.amountCents, 0);
  return {
    id: ledger.group.id,
    name: ledger.group.name,
    defaultCurrency: ledger.group.defaultCurrency,
    memberCount: ledger.members.filter((m) => m.isActive).length,
    volume: centsToDecimal(spend),
    expenseCount: ledger.expenses.length,
    createdAt: ledger.group.createdAt.toISOString(),
  };
}

export function groupDetail(ledger: GroupLedger): AdminGroupDetailDto {
  const totals = memberTotals(ledger);
  const nameOf = new Map(ledger.members.map((m) => [m.id, m.displayName]));
  const memberDtos: AdminGroupMemberDto[] = ledger.members
    .map((m) => {
      const t = totals.get(m.id) ?? { paidCents: 0, shareCents: 0, expenseCount: 0 };
      return {
        memberId: m.id,
        displayName: m.displayName,
        username: m.username,
        telegramUserId: telegramIdToString(m.telegramUserId),
        isManual: isManualId(m.telegramUserId),
        role: m.role,
        isActive: m.isActive,
        isPrimary: m.isPrimary,
        paid: centsToDecimal(t.paidCents),
        share: centsToDecimal(t.shareCents),
        net: centsToDecimal(ledger.nets.get(m.id) ?? 0),
        expenseCount: t.expenseCount,
      };
    })
    // Active members first, then whoever fronted the most.
    .sort(
      (a, b) =>
        Number(b.isActive) - Number(a.isActive) ||
        decimalToCents(b.paid) - decimalToCents(a.paid),
    );
  const loans = ledger.expenses.filter((e) => e.kind === "loan");
  const settled = ledger.settlements.reduce((sum, s) => sum + decimalToCents(s.amount), 0);
  const settledExpenses = ledger.expenses.filter((e) => ledger.coveredExpenseIds.has(e.id)).length;
  return {
    group: groupSummary(ledger),
    members: memberDtos,
    transfers: ledger.transfers.map((t) => ({
      fromMemberId: t.fromMemberId,
      fromName: nameOf.get(t.fromMemberId) ?? "?",
      toMemberId: t.toMemberId,
      toName: nameOf.get(t.toMemberId) ?? "?",
      amount: centsToDecimal(t.amountCents),
    })),
    settlements: ledger.settlements.slice(0, 50).map(
      (s): AdminSettlementDto => ({
        id: s.id,
        groupId: ledger.group.id,
        groupName: ledger.group.name,
        fromName: nameOf.get(s.fromMemberId) ?? "?",
        toName: nameOf.get(s.toMemberId) ?? "?",
        amount: s.amount,
        currency: s.currency,
        method: s.method,
        at: (s.occurredAt ?? s.createdAt).toISOString(),
      }),
    ),
    stats: {
      spend: groupSummary(ledger).volume,
      loans: centsToDecimal(loans.reduce((sum, e) => sum + e.amountCents, 0)),
      settled: centsToDecimal(settled),
      openExpenses: ledger.expenses.length - settledExpenses,
      settledExpenses,
    },
  };
}

/** One row per group a Telegram user belongs to, with their position there. */
export function membershipOf(ledger: GroupLedger, member: Member): AdminUserMembershipDto {
  const t = memberTotals(ledger).get(member.id) ?? { paidCents: 0, shareCents: 0, expenseCount: 0 };
  return {
    groupId: ledger.group.id,
    groupName: ledger.group.name,
    currency: ledger.group.defaultCurrency,
    memberId: member.id,
    displayName: member.displayName,
    role: member.role,
    isActive: member.isActive,
    isPrimary: member.isPrimary,
    paid: centsToDecimal(t.paidCents),
    net: centsToDecimal(ledger.nets.get(member.id) ?? 0),
    expenseCount: t.expenseCount,
  };
}

/**
 * Expense feed with real splits and settled state. Filters by group and/or
 * by the member rows of one Telegram user; paginated with a true total.
 */
export async function listExpensePage(
  db: Db,
  opts: {
    groupId?: string;
    memberIds?: string[];
    kind?: "expense" | "loan";
    /** matches the description or the group name */
    search?: string;
    limit: number;
    offset: number;
  },
): Promise<AdminExpensePageDto> {
  const filters: SQL[] = [];
  if (opts.groupId) filters.push(eq(expenses.groupId, opts.groupId));
  if (opts.memberIds) {
    if (opts.memberIds.length === 0) return { items: [], total: 0 };
    filters.push(inArray(expenses.payerMemberId, opts.memberIds));
  }
  if (opts.kind) filters.push(eq(expenses.kind, opts.kind));
  if (opts.search) {
    const like = `%${opts.search.replace(/[%_\\]/g, (c) => `\\${c}`)}%`;
    filters.push(or(ilike(expenses.description, like), ilike(groups.name, like))!);
  }
  const where = filters.length ? and(...filters) : undefined;
  const [{ total }] = (await db
    .select({ total: count() })
    .from(expenses)
    .innerJoin(groups, eq(expenses.groupId, groups.id))
    .where(where)) as [{ total: number }];
  const rows = await db
    .select({ expense: expenses, groupName: groups.name })
    .from(expenses)
    .innerJoin(groups, eq(expenses.groupId, groups.id))
    .where(where)
    .orderBy(desc(expenses.occurredAt), desc(expenses.createdAt))
    .limit(opts.limit)
    .offset(opts.offset);

  // Settled state comes from each group's allocations, so load those ledgers.
  const ledgers = new Map<string, GroupLedger>();
  for (const gid of new Set(rows.map((r) => r.expense.groupId))) {
    const l = await loadGroupLedger(db, gid);
    if (l) ledgers.set(gid, l);
  }
  const ids = rows.map((r) => r.expense.id);
  const shareRows = ids.length
    ? await db.select().from(expenseShares).where(inArray(expenseShares.expenseId, ids))
    : [];

  const items = rows.map(({ expense: e, groupName }): AdminExpenseDto => {
    const ledger = ledgers.get(e.groupId);
    const nameOf = (id: string) => ledger?.members.find((m) => m.id === id)?.displayName ?? "?";
    return {
      id: e.id,
      description: e.description,
      amount: e.amount,
      currency: e.currency,
      kind: e.kind,
      source: e.source,
      groupId: e.groupId,
      groupName,
      payerMemberId: e.payerMemberId,
      payerName: nameOf(e.payerMemberId),
      occurredAt: e.occurredAt.toISOString(),
      voided: e.voidedAt !== null,
      status: e.voidedAt ? "voided" : ledger?.coveredExpenseIds.has(e.id) ? "settled" : "open",
      shares: shareRows
        .filter((s) => s.expenseId === e.id)
        .map((s) => ({ memberId: s.memberId, name: nameOf(s.memberId), amount: s.shareAmount })),
    };
  });
  return { items, total: Number(total) };
}
