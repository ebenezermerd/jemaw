/**
 * Split computation. All math is in integer cents to avoid float drift
 * (JEMAW_PLAN.md §14).
 *
 * Equal and weighted splits floor every member's share DOWN to a whole
 * currency unit (a multiple of 100 cents), so nobody is ever asked to pay
 * cents. The gap between the expense total and the sum of shares is absorbed
 * by the payer: it is never assigned to a member and never becomes debt, so
 * shares may sum to LESS than the total. Exact splits are typed explicitly
 * and must still sum exactly to the total.
 *
 * Pure — no DB, no I/O.
 */
import type { SplitType } from "@jemaw/shared/types";

const CENTS_PER_UNIT = 100;

export interface SplitInput {
  /** total expense amount in integer cents */
  totalCents: number;
  splitType: SplitType;
  /** member ids participating in the split (order matters for determinism) */
  memberIds: string[];
  /** required for "shares": memberId -> positive integer share count */
  shares?: Record<string, number>;
  /** required for "exact": memberId -> integer cents */
  exactCents?: Record<string, number>;
}

export interface ComputedShare {
  memberId: string;
  shareCents: number;
}

/**
 * Distribute `totalCents` across members weighted by `weights` (parallel to
 * memberIds), flooring each share to a whole currency unit. The remainder is
 * intentionally dropped — the payer absorbs it.
 */
function distribute(
  memberIds: string[],
  weights: number[],
  totalCents: number,
): ComputedShare[] {
  const totalWeight = weights.reduce((a, b) => a + b, 0);
  if (totalWeight <= 0) {
    throw new Error("Split weights must sum to a positive value");
  }
  return memberIds.map((id, i) => {
    const raw = Math.floor((totalCents * weights[i]!) / totalWeight);
    return {
      memberId: id,
      shareCents: Math.floor(raw / CENTS_PER_UNIT) * CENTS_PER_UNIT,
    };
  });
}

export function computeSplit(input: SplitInput): ComputedShare[] {
  const { totalCents, splitType, memberIds } = input;
  if (memberIds.length === 0) {
    throw new Error("Split must include at least one member");
  }
  if (totalCents <= 0) {
    throw new Error("Expense amount must be positive");
  }

  switch (splitType) {
    case "equal": {
      return distribute(
        memberIds,
        memberIds.map(() => 1),
        totalCents,
      );
    }
    case "shares": {
      const shares = input.shares ?? {};
      const weights = memberIds.map((id) => {
        const w = shares[id];
        if (!Number.isInteger(w) || (w as number) <= 0) {
          throw new Error(`Member ${id} needs a positive integer share`);
        }
        return w as number;
      });
      return distribute(memberIds, weights, totalCents);
    }
    case "exact": {
      const exact = input.exactCents ?? {};
      const result = memberIds.map((id) => {
        const c = exact[id];
        if (!Number.isInteger(c) || (c as number) < 0) {
          throw new Error(`Member ${id} needs a non-negative exact amount`);
        }
        return { memberId: id, shareCents: c as number };
      });
      const sum = result.reduce((a, b) => a + b.shareCents, 0);
      if (sum !== totalCents) {
        throw new Error(
          `Exact shares (${sum}) must sum to total (${totalCents})`,
        );
      }
      return result;
    }
  }
}
