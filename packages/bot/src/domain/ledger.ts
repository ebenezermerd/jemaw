import type { Db } from "../db.js";
import type { Member } from "@jemaw/shared/schema";
import { decimalToCents } from "@jemaw/shared/types";
import {
  listMembers,
  listLiveExpenses,
  listSettlements,
  listSettlementAllocations,
  type ExpenseWithShares,
} from "../repo.js";
import {
  computeBalances,
  type ExpenseForBalance,
  type MemberNet,
} from "./balances.js";
import {
  isExpenseCovered,
  deriveExpenseDebts,
  computePairwiseTransfers,
  type ExpenseForDebt,
  type AllocationForDebt,
} from "./pairwiseDebt.js";
import type { Transfer } from "./settle.js";

/**
 * Load the full ledger for a group: net balances (for Balances screen),
 * pairwise settle plan (for Settle / Home), coverage set, and the raw data
 * needed by settlement-create validation.
 *
 * nets   — computed from ALL live expenses + ALL settlements (zero-sum invariant).
 * transfers — per-creditor pairwise debts (pay who fronted your share).
 * coveredExpenseIds — expenses where every debtor share is within tolerance.
 */
export async function loadLedger(
  db: Db,
  groupId: string,
): Promise<{
  members: Member[];
  liveExpenses: ExpenseWithShares[];
  nets: MemberNet[];
  expensesForDebt: ExpenseForDebt[];
  allocations: AllocationForDebt[];
  coveredExpenseIds: Set<string>;
  transfers: Transfer[];
}> {
  const members = await listMembers(db, groupId);
  const liveExpenses = await listLiveExpenses(db, groupId);
  const settlements = await listSettlements(db, groupId);
  const rawAllocations = await listSettlementAllocations(db, groupId);

  // Net balances (unchanged from before — keeps zero-sum invariant).
  const forBalance: ExpenseForBalance[] = liveExpenses.map((e) => ({
    payerMemberId: e.expense.payerMemberId,
    shares: e.shares.map((s) => ({
      memberId: s.memberId,
      shareCents: decimalToCents(s.shareAmount),
    })),
  }));
  const forSettle = settlements.map((s) => ({
    fromMemberId: s.fromMemberId,
    toMemberId: s.toMemberId,
    amountCents: decimalToCents(s.amount),
  }));
  const nets = computeBalances(
    members.map((m) => m.id),
    forBalance,
    forSettle,
  );

  // Expense-level debt for coverage checks and settlement allocation.
  const expensesForDebt: ExpenseForDebt[] = liveExpenses.map((e) => ({
    expenseId: e.expense.id,
    payerMemberId: e.expense.payerMemberId,
    occurredAt: e.expense.occurredAt,
    shares: e.shares.map((s) => ({
      memberId: s.memberId,
      shareCents: decimalToCents(s.shareAmount),
    })),
  }));
  const allocations: AllocationForDebt[] = rawAllocations.map((a) => ({
    expenseId: a.expenseId,
    memberId: a.memberId,
    allocatedCents: decimalToCents(a.allocatedAmount),
  }));

  const coveredExpenseIds = new Set(
    expensesForDebt
      .filter((e) => isExpenseCovered(e, allocations))
      .map((e) => e.expenseId),
  );

  const transfers = computePairwiseTransfers(
    deriveExpenseDebts(expensesForDebt, allocations),
  );

  return {
    members,
    liveExpenses,
    nets,
    expensesForDebt,
    allocations,
    coveredExpenseIds,
    transfers,
  };
}
