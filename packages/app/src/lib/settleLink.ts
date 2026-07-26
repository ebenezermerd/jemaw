import type { TransferDto } from "@jemaw/shared/types";

/** Query string for the settle form from a live transfer row. */
export function settleFormSearchParams(t: TransferDto): string {
  return new URLSearchParams({
    from: t.fromMemberId,
    to: t.toMemberId,
    amount: t.amount,
  }).toString();
}
