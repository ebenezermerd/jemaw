/**
 * Split computation. All math is in integer cents to avoid float drift
 * (JEMAW_PLAN.md §14). Every function returns per-member share cents that
 * sum EXACTLY to the total.
 *
 * Pure — no DB, no I/O.
 */
import type { SplitType } from "@jemaw/shared/types";

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
  /** stable id used to pick the remainder-bearer deterministically */
  expenseSeed: string;
}

export interface ComputedShare {
  memberId: string;
  shareCents: number;
}

/** Deterministic, fair-over-time remainder bearer selection (plan §14). */
function seedOffset(seed: string, modulo: number): number {
  let h = 0;
  for (let i = 0; i < seed.length; i++) {
    h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  }
  return modulo === 0 ? 0 : h % modulo;
}

/**
 * Distribute `totalCents` across members weighted by `weights` (parallel to
 * memberIds). Remainder cents are handed out one each, starting at a
 * seed-derived offset so the bearer rotates fairly across expenses.
 */
function distribute(
  memberIds: string[],
  weights: number[],
  totalCents: number,
  seed: string,
): ComputedShare[] {
  const totalWeight = weights.reduce((a, b) => a + b, 0);
  if (totalWeight <= 0) {
    throw new Error("Split weights must sum to a positive value");
  }
  const base = memberIds.map((id, i) => ({
    memberId: id,
    shareCents: Math.floor((totalCents * weights[i]!) / totalWeight),
  }));
  let remainder = totalCents - base.reduce((a, b) => a + b.shareCents, 0);
  // Hand out leftover cents, rotating the starting point by the seed.
  const n = base.length;
  const start = seedOffset(seed, n);
  for (let k = 0; remainder > 0 && k < n; k++) {
    base[(start + k) % n]!.shareCents += 1;
    remainder -= 1;
  }
  return base;
}

export function computeSplit(input: SplitInput): ComputedShare[] {
  const { totalCents, splitType, memberIds, expenseSeed } = input;
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
        expenseSeed,
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
      return distribute(memberIds, weights, totalCents, expenseSeed);
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
