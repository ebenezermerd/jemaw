import type { TransferDto } from "@jemaw/shared/types";

/** Query string for the settle form from a live transfer row. */
export function settleFormSearchParams(t: TransferDto): string {
  const p = new URLSearchParams({
    from: t.fromMemberId,
    to: t.toMemberId,
    amount: t.amount,
  });
  if (t.attributedAmount && t.attributedAmount !== t.amount) {
    p.set("attributed", t.attributedAmount);
  }
  return p.toString();
}
