/**
 * Balance computation. Pure: takes plain expense/share/settlement data and
 * returns each member's net position in integer cents.
 *
 * net(member) = (amounts they PAID as payer)
 *             - (their SHARES across all expenses)
 *             + (settlements they PAID as `from`)     // paying down their debt
 *             - (settlements they RECEIVED as `to`)   // reduces what they're owed
 *
 * Voided expenses are excluded by the caller (pass only live ones).
 * Invariant: all nets sum to 0.
 */

export interface ExpenseForBalance {
  payerMemberId: string;
  /** total amount in cents */
  amountCents: number;
  shares: { memberId: string; shareCents: number }[];
}

export interface SettlementForBalance {
  fromMemberId: string;
  toMemberId: string;
  amountCents: number;
}

export interface MemberNet {
  memberId: string;
  netCents: number;
}

export function computeBalances(
  memberIds: string[],
  expenses: ExpenseForBalance[],
  settlements: SettlementForBalance[] = [],
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

  for (const s of settlements) {
    // Debtor pays the creditor: debtor's net rises toward 0, creditor's falls.
    net.set(s.fromMemberId, (net.get(s.fromMemberId) ?? 0) + s.amountCents);
    net.set(s.toMemberId, (net.get(s.toMemberId) ?? 0) - s.amountCents);
  }

  return memberIds.map((id) => ({ memberId: id, netCents: net.get(id) ?? 0 }));
}
