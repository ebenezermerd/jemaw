import { describe, it, expect } from "vitest";
import {
  deriveExpenseDebts,
  isShareCovered,
  isExpenseCovered,
  computePairwiseTransfers,
  COVERAGE_TOLERANCE_CENTS,
  type ExpenseForDebt,
  type AllocationForDebt,
} from "./pairwiseDebt.js";

// ── helpers ──────────────────────────────────────────────────────────────────
function exp(
  id: string,
  payer: string,
  shares: { m: string; c: number }[],
  date?: Date,
): ExpenseForDebt {
  return {
    expenseId: id,
    payerMemberId: payer,
    occurredAt: date ?? new Date("2026-01-01"),
    shares: shares.map((s) => ({ memberId: s.m, shareCents: s.c })),
  };
}
function alloc(expenseId: string, memberId: string, cents: number): AllocationForDebt {
  return { expenseId, memberId, allocatedCents: cents };
}

describe("pairwiseDebt regression: apó / Gemechis / Getish scenario", () => {
  it("apó only owes Gemechis — never Getish", () => {
    const expenses: ExpenseForDebt[] = [
      exp("gem-exp", "gemechis", [
        { m: "gemechis", c: 330 },
        { m: "apo", c: 330 },
        { m: "liben", c: 330 },
        { m: "ayenew", c: 330 },
      ]),
      exp("get-exp", "getish", [
        { m: "getish", c: 425 },
        { m: "ayenew", c: 425 },
      ]),
    ];
    const transfers = computePairwiseTransfers(deriveExpenseDebts(expenses, []));
    const apoTransfers = transfers.filter((t) => t.fromMemberId === "apo");
    expect(apoTransfers).toHaveLength(1);
    expect(apoTransfers[0]).toMatchObject({ fromMemberId: "apo", toMemberId: "gemechis", amountCents: 330 });
    expect(transfers.find((t) => t.fromMemberId === "apo" && t.toMemberId === "getish")).toBeUndefined();
  });
});

describe("deriveExpenseDebts", () => {
  it("payer owes nothing for their own share", () => {
    const e = exp("e1", "sara", [
      { m: "sara", c: 1500 },
      { m: "tom", c: 1500 },
    ]);
    const debts = deriveExpenseDebts([e], []);
    // Only tom owes sara
    expect(debts).toHaveLength(1);
    expect(debts[0]).toMatchObject({
      debtorMemberId: "tom",
      creditorMemberId: "sara",
      owedCents: 1500,
    });
  });

  it("equal split 3 ways", () => {
    const e = exp("e1", "alice", [
      { m: "alice", c: 1000 },
      { m: "bob", c: 1000 },
      { m: "carol", c: 1000 },
    ]);
    const debts = deriveExpenseDebts([e], []);
    expect(debts).toHaveLength(2);
    expect(debts.map((d) => d.owedCents)).toEqual([1000, 1000]);
    expect(debts.map((d) => d.debtorMemberId).sort()).toEqual(["bob", "carol"]);
    expect(debts.every((d) => d.creditorMemberId === "alice")).toBe(true);
  });

  it("loan: borrower owes lender full amount", () => {
    const e = exp("loan1", "lender", [{ m: "borrower", c: 5000 }]);
    const debts = deriveExpenseDebts([e], []);
    expect(debts).toHaveLength(1);
    expect(debts[0]).toMatchObject({
      debtorMemberId: "borrower",
      creditorMemberId: "lender",
      owedCents: 5000,
    });
  });

  it("full allocation zeroes the residual", () => {
    const e = exp("e1", "sara", [
      { m: "sara", c: 1500 },
      { m: "tom", c: 1500 },
    ]);
    const allocs = [alloc("e1", "tom", 1500)];
    const debts = deriveExpenseDebts([e], allocs);
    expect(debts).toHaveLength(0);
  });

  it("partial allocation reduces residual", () => {
    const e = exp("e1", "sara", [
      { m: "sara", c: 1500 },
      { m: "tom", c: 1500 },
    ]);
    const allocs = [alloc("e1", "tom", 900)];
    const debts = deriveExpenseDebts([e], allocs);
    expect(debts).toHaveLength(1);
    expect(debts[0]!.owedCents).toBe(600);
  });

  it("multiple expenses aggregate independently", () => {
    const e1 = exp("e1", "sara", [{ m: "tom", c: 2000 }]);
    const e2 = exp("e2", "sara", [{ m: "tom", c: 3000 }]);
    const debts = deriveExpenseDebts([e1, e2], []);
    expect(debts).toHaveLength(2);
    expect(debts.map((d) => d.owedCents).sort((a, b) => a - b)).toEqual([2000, 3000]);
  });
});

describe("isShareCovered", () => {
  it("residual exactly at tolerance is covered", () => {
    expect(isShareCovered(2340, 2040)).toBe(true); // gap = 300 = tolerance
  });

  it("residual one cent above tolerance is not covered", () => {
    expect(isShareCovered(2340, 2039)).toBe(false); // gap = 301 > tolerance
  });

  it("exact full payment is covered", () => {
    expect(isShareCovered(1500, 1500)).toBe(true);
  });

  it("over-allocation is still covered", () => {
    expect(isShareCovered(1500, 1600)).toBe(true);
  });

  it("tolerance boundary value: " + COVERAGE_TOLERANCE_CENTS, () => {
    const owed = 10000;
    expect(isShareCovered(owed, owed - COVERAGE_TOLERANCE_CENTS)).toBe(true);
    expect(isShareCovered(owed, owed - COVERAGE_TOLERANCE_CENTS - 1)).toBe(false);
  });
});

describe("isExpenseCovered", () => {
  it("covered when all debtors are within tolerance", () => {
    const e = exp("e1", "alice", [
      { m: "alice", c: 1000 },
      { m: "bob", c: 1000 },
      { m: "carol", c: 1000 },
    ]);
    const allocs = [alloc("e1", "bob", 950), alloc("e1", "carol", 990)];
    expect(isExpenseCovered(e, allocs)).toBe(true);
  });

  it("not covered when one debtor exceeds tolerance", () => {
    const e = exp("e1", "alice", [
      { m: "alice", c: 1000 },
      { m: "bob", c: 1000 },
      { m: "carol", c: 1000 },
    ]);
    const allocs = [alloc("e1", "bob", 1000), alloc("e1", "carol", 600)]; // gap 400 > 300
    expect(isExpenseCovered(e, allocs)).toBe(false);
  });

  it("expense with no non-payer shares is covered by default", () => {
    const e = exp("e1", "alice", [{ m: "alice", c: 3000 }]);
    expect(isExpenseCovered(e, [])).toBe(true);
  });
});

describe("computePairwiseTransfers", () => {
  it("aggregates same pair across multiple expenses", () => {
    const debts = [
      { debtorMemberId: "tom", creditorMemberId: "sara", expenseId: "e1", owedCents: 1000 },
      { debtorMemberId: "tom", creditorMemberId: "sara", expenseId: "e2", owedCents: 500 },
    ];
    const transfers = computePairwiseTransfers(debts);
    expect(transfers).toHaveLength(1);
    expect(transfers[0]).toMatchObject({
      fromMemberId: "tom",
      toMemberId: "sara",
      amountCents: 1500,
    });
  });

  it("different pairs produce separate transfers", () => {
    const debts = [
      { debtorMemberId: "tom", creditorMemberId: "sara", expenseId: "e1", owedCents: 1000 },
      { debtorMemberId: "bob", creditorMemberId: "alice", expenseId: "e2", owedCents: 2000 },
    ];
    const transfers = computePairwiseTransfers(debts);
    expect(transfers).toHaveLength(2);
  });

  it("is deterministic regardless of input order", () => {
    const debts1 = [
      { debtorMemberId: "z-tom", creditorMemberId: "a-sara", expenseId: "e1", owedCents: 1000 },
      { debtorMemberId: "a-bob", creditorMemberId: "z-alice", expenseId: "e2", owedCents: 2000 },
    ];
    const debts2 = [...debts1].reverse();
    expect(computePairwiseTransfers(debts1)).toEqual(computePairwiseTransfers(debts2));
  });

  it("empty input produces empty output", () => {
    expect(computePairwiseTransfers([])).toEqual([]);
  });
});
