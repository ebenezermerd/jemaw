/**
 * Minimum-transactions settle-up (JEMAW_PLAN.md §14). Greedy: repeatedly match
 * the largest creditor with the largest debtor. Integer cents throughout.
 *
 * Not proof-optimal (the general problem is NP-hard) but minimal or near-minimal
 * for groups < ~12, and O(n log n). Deterministic: ties broken by memberId so
 * output is stable and testable.
 *
 * Pure — no DB, no I/O.
 */
import type { MemberNet } from "./balances.js";

export interface Transfer {
  fromMemberId: string;
  toMemberId: string;
  amountCents: number;
}

export function computeSettlement(nets: MemberNet[]): Transfer[] {
  // Mutable working copies, excluding already-even members.
  const creditors = nets
    .filter((n) => n.netCents > 0)
    .map((n) => ({ id: n.memberId, amount: n.netCents }));
  const debtors = nets
    .filter((n) => n.netCents < 0)
    .map((n) => ({ id: n.memberId, amount: -n.netCents })); // positive magnitude

  // Sort by magnitude desc, then memberId asc for deterministic tie-break.
  const byMagnitude = (
    a: { id: string; amount: number },
    b: { id: string; amount: number },
  ) => b.amount - a.amount || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
  creditors.sort(byMagnitude);
  debtors.sort(byMagnitude);

  const transfers: Transfer[] = [];
  let ci = 0;
  let di = 0;

  while (ci < creditors.length && di < debtors.length) {
    const c = creditors[ci]!;
    const d = debtors[di]!;
    const t = Math.min(c.amount, d.amount);
    if (t > 0) {
      transfers.push({
        fromMemberId: d.id,
        toMemberId: c.id,
        amountCents: t,
      });
    }
    c.amount -= t;
    d.amount -= t;
    if (c.amount === 0) ci++;
    if (d.amount === 0) di++;
  }

  return transfers;
}
