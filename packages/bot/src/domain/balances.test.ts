import { describe, it, expect } from "vitest";
import { computeBalances, type ExpenseForBalance } from "./balances.js";

describe("computeBalances", () => {
  it("credits payer and debits each share", () => {
    const expenses: ExpenseForBalance[] = [
      {
        payerMemberId: "a",
        shares: [
          { memberId: "a", shareCents: 400 },
          { memberId: "b", shareCents: 400 },
          { memberId: "c", shareCents: 400 },
        ],
      },
    ];
    const r = computeBalances(["a", "b", "c"], expenses);
    const by = Object.fromEntries(r.map((x) => [x.memberId, x.netCents]));
    expect(by).toEqual({ a: 800, b: -400, c: -400 });
  });

  it("credits payer only the collectible share total when cents are absorbed", () => {
    // 10.01 paid by a, floored to 3.00 per member: a absorbs the 1.01 leftover.
    const expenses: ExpenseForBalance[] = [
      {
        payerMemberId: "a",
        shares: [
          { memberId: "a", shareCents: 300 },
          { memberId: "b", shareCents: 300 },
          { memberId: "c", shareCents: 300 },
        ],
      },
    ];
    const r = computeBalances(["a", "b", "c"], expenses);
    const by = Object.fromEntries(r.map((x) => [x.memberId, x.netCents]));
    expect(by).toEqual({ a: 600, b: -300, c: -300 });
    expect(r.reduce((s, x) => s + x.netCents, 0)).toBe(0);
  });

  it("all nets sum to zero across multiple expenses", () => {
    const expenses: ExpenseForBalance[] = [
      {
        payerMemberId: "a",
        shares: [
          { memberId: "a", shareCents: 500 },
          { memberId: "b", shareCents: 500 },
        ],
      },
      {
        payerMemberId: "b",
        shares: [
          { memberId: "a", shareCents: 300 },
          { memberId: "b", shareCents: 300 },
        ],
      },
    ];
    const r = computeBalances(["a", "b"], expenses);
    expect(r.reduce((s, x) => s + x.netCents, 0)).toBe(0);
    const by = Object.fromEntries(r.map((x) => [x.memberId, x.netCents]));
    expect(by).toEqual({ a: 200, b: -200 });
  });

  it("members with no activity are zero", () => {
    const r = computeBalances(["a", "b", "c"], []);
    expect(r.every((x) => x.netCents === 0)).toBe(true);
  });

  it("models a loan as lender credit and borrower debt", () => {
    const expenses: ExpenseForBalance[] = [
      {
        payerMemberId: "sara",
        shares: [{ memberId: "tom", shareCents: 30000 }],
      },
    ];
    const r = computeBalances(["sara", "tom"], expenses);
    const by = Object.fromEntries(r.map((x) => [x.memberId, x.netCents]));
    expect(by).toEqual({ sara: 30000, tom: -30000 });
  });

  it("a paid settlement zeroes the pair and preserves zero-sum", () => {
    // a paid 1000, split with b → a +500, b -500. Then b pays a 500.
    const expenses: ExpenseForBalance[] = [
      {
        payerMemberId: "a",
        shares: [
          { memberId: "a", shareCents: 500 },
          { memberId: "b", shareCents: 500 },
        ],
      },
    ];
    const settlements = [
      { fromMemberId: "b", toMemberId: "a", amountCents: 500 },
    ];
    const r = computeBalances(["a", "b"], expenses, settlements);
    const by = Object.fromEntries(r.map((x) => [x.memberId, x.netCents]));
    expect(by).toEqual({ a: 0, b: 0 });
    expect(r.reduce((s, x) => s + x.netCents, 0)).toBe(0);
  });

  it("a partial settlement reduces but does not clear the debt", () => {
    const expenses: ExpenseForBalance[] = [
      {
        payerMemberId: "a",
        shares: [
          { memberId: "a", shareCents: 500 },
          { memberId: "b", shareCents: 500 },
        ],
      },
    ];
    const settlements = [
      { fromMemberId: "b", toMemberId: "a", amountCents: 200 },
    ];
    const r = computeBalances(["a", "b"], expenses, settlements);
    const by = Object.fromEntries(r.map((x) => [x.memberId, x.netCents]));
    expect(by).toEqual({ a: 300, b: -300 });
  });
});
