/**
 * Balance computation. Pure: takes plain expense/share data and returns each
 * member's net position in integer cents.
 *
 * net(member) = (sum of amounts they PAID as payer)
 *             - (sum of their SHARES across all expenses)
 *
 * Voided expenses are excluded by the caller (pass only live ones).
 * Phase 1 has no settlements; they enter the calc in Phase 2.
 * Invariant: all nets sum to 0.
 */

export interface ExpenseForBalance {
  payerMemberId: string;
  /** total amount in cents */
  amountCents: number;
  shares: { memberId: string; shareCents: number }[];
}

export interface MemberNet {
  memberId: string;
  netCents: number;
}

export function computeBalances(
  memberIds: string[],
  expenses: ExpenseForBalance[],
): MemberNet[] {
  const net = new Map<string, number>();
  for (const id of memberIds) net.set(id, 0);

  for (const e of expenses) {
    // Payer is credited the full amount they fronted.
    net.set(e.payerMemberId, (net.get(e.payerMemberId) ?? 0) + e.amountCents);
    // Each participant is debited their share.
    for (const s of e.shares) {
      net.set(s.memberId, (net.get(s.memberId) ?? 0) - s.shareCents);
    }
  }

  return memberIds.map((id) => ({ memberId: id, netCents: net.get(id) ?? 0 }));
}
