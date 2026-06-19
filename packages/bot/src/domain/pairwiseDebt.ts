/**
 * Per-creditor ("pay-who-paid-for-you") settlement algorithm.
 *
 * Instead of global debt-netting (which routes debts across unrelated members),
 * this derives directional pairwise debts directly from expense_shares:
 *   - for each expense, the payer is the creditor
 *   - each non-payer sharer owes the payer their share cents
 *   - existing allocations reduce the residual owed
 *
 * A debtor is ONLY ever matched with members who actually paid for their shares —
 * never rerouted to a third party.
 *
 * Pure — no DB, no I/O. Integer cents throughout.
 */
import type { Transfer } from "./settle.js";

export interface ExpenseForDebt {
  expenseId: string;
  payerMemberId: string;
  occurredAt: Date;
  shares: { memberId: string; shareCents: number }[];
}

export interface AllocationForDebt {
  expenseId: string;
  memberId: string; // debtor whose share is being paid
  allocatedCents: number;
}

export interface PairDebt {
  debtorMemberId: string;
  creditorMemberId: string;
  expenseId: string;
  owedCents: number; // residual owed on this expense (after allocations)
}

/** A debtor's share is "covered" when the remaining gap is within tolerance. */
export const COVERAGE_TOLERANCE_CENTS = 300; // 3.00 currency unit

export function isShareCovered(
  owedShareCents: number,
  allocatedCents: number,
): boolean {
  return owedShareCents - allocatedCents <= COVERAGE_TOLERANCE_CENTS;
}

/** An expense is fully covered when every debtor's share is covered. */
export function isExpenseCovered(
  expense: ExpenseForDebt,
  allocations: AllocationForDebt[],
): boolean {
  const debtors = expense.shares.filter(
    (s) => s.memberId !== expense.payerMemberId,
  );
  if (debtors.length === 0) return true; // payer paid themselves only
  return debtors.every((s) => {
    const allocated = allocations
      .filter(
        (a) => a.expenseId === expense.expenseId && a.memberId === s.memberId,
      )
      .reduce((sum, a) => sum + a.allocatedCents, 0);
    return isShareCovered(s.shareCents, allocated);
  });
}

/**
 * Derive per-(debtor, creditor, expense) residual debts from live expenses and
 * existing allocations. Residual = max(0, share - sum(allocations)).
 * Only rows with owedCents > 0 are returned (i.e. uncovered).
 */
export function deriveExpenseDebts(
  expenses: ExpenseForDebt[],
  allocations: AllocationForDebt[],
): PairDebt[] {
  const debts: PairDebt[] = [];
  for (const e of expenses) {
    for (const s of e.shares) {
      if (s.memberId === e.payerMemberId) continue; // payer doesn't owe themselves
      const allocated = allocations
        .filter(
          (a) => a.expenseId === e.expenseId && a.memberId === s.memberId,
        )
        .reduce((sum, a) => sum + a.allocatedCents, 0);
      const residual = Math.max(0, s.shareCents - allocated);
      if (residual > COVERAGE_TOLERANCE_CENTS) {
        debts.push({
          debtorMemberId: s.memberId,
          creditorMemberId: e.payerMemberId,
          expenseId: e.expenseId,
          owedCents: residual,
        });
      }
    }
  }
  return debts;
}

/**
 * Aggregate residual PairDebts by (debtor, creditor) and emit one Transfer
 * per pair. Deterministic: ordered by (creditorId asc, debtorId asc).
 * Reuses the Transfer shape from settle.ts.
 */
export function computePairwiseTransfers(debts: PairDebt[]): Transfer[] {
  // Sum residuals per (debtor, creditor) pair.
  const map = new Map<string, number>();
  for (const d of debts) {
    const key = `${d.debtorMemberId}|${d.creditorMemberId}`;
    map.set(key, (map.get(key) ?? 0) + d.owedCents);
  }

  // Net opposing pairs: if A→B and B→A both exist, keep only the positive difference.
  const netted = new Map<string, number>();
  for (const [key, amount] of map) {
    const [a, b] = key.split("|") as [string, string];
    const reverseKey = `${b}|${a}`;
    if (netted.has(reverseKey)) {
      const rev = netted.get(reverseKey)!;
      if (amount > rev) {
        netted.delete(reverseKey);
        netted.set(key, amount - rev);
      } else {
        netted.set(reverseKey, rev - amount);
      }
    } else {
      netted.set(key, amount);
    }
  }

  const transfers: Transfer[] = [];
  for (const [key, amountCents] of netted) {
    if (amountCents <= COVERAGE_TOLERANCE_CENTS) continue;
    const [fromMemberId, toMemberId] = key.split("|") as [string, string];
    transfers.push({ fromMemberId, toMemberId, amountCents });
  }

  // Stable sort: creditor asc, then debtor asc.
  transfers.sort((a, b) => {
    const tc = a.toMemberId < b.toMemberId ? -1 : a.toMemberId > b.toMemberId ? 1 : 0;
    if (tc !== 0) return tc;
    return a.fromMemberId < b.fromMemberId ? -1 : a.fromMemberId > b.fromMemberId ? 1 : 0;
  });

  return transfers;
}
