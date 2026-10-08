import { describe, it, expect } from "vitest";
import {
  computeLedgerSnapshot,
  ledgerHighlights,
  formatCents,
  ledgerNames,
  ledgerNumberTokens,
} from "./snapshot.js";

const now = new Date("2026-10-08T12:00:00Z");
const day = 24 * 60 * 60 * 1000;

function member(id: string, name: string, tg: number) {
  return { id, displayName: name, telegramUserId: BigInt(tg) } as never;
}

function expense(
  id: string,
  description: string,
  amount: string,
  payer: string,
  daysAgo: number,
  shareMembers: string[],
  kind: "expense" | "loan" = "expense",
) {
  return {
    expense: {
      id,
      description,
      amount,
      payerMemberId: payer,
      occurredAt: new Date(now.getTime() - daysAgo * day),
      kind,
    },
    shares: shareMembers.map((m) => ({ memberId: m, shareAmount: "0" })),
  } as never;
}

const members = [
  member("a", "Abenezer", 1),
  member("s", "Sami", 2),
  member("h", "Hana", 3),
];

const base = {
  members,
  currency: "ETB",
  liveExpenses: [
    expense("e1", "Dinner", "1200.00", "a", 1, ["a", "s", "h"]),
    expense("e2", "Taxi", "300.00", "s", 3, ["s", "h"]),
    expense("e3", "Old trip", "5000.00", "h", 40, ["a", "s", "h"]),
    expense("e4", "Loan to Sami", "500.00", "a", 2, ["s"], "loan"),
  ],
  nets: [
    { memberId: "a", netCents: 120000 },
    { memberId: "s", netCents: -30000 },
    { memberId: "h", netCents: -90000 },
  ],
  transfers: [
    { fromMemberId: "h", toMemberId: "a", amountCents: 40000 },
    { fromMemberId: "s", toMemberId: "a", amountCents: 90000 },
    { fromMemberId: "h", toMemberId: "s", amountCents: 15000 },
  ],
  pending: [
    { description: "Coffee", amount: "90.00" },
    { description: "Snacks", amount: null },
  ] as never,
  now,
};

describe("computeLedgerSnapshot", () => {
  it("identifies the asker by telegram id with who they owe and who owes them", () => {
    const snap = computeLedgerSnapshot({ ...base, askerTelegramId: 2n });
    expect(snap.asker).toEqual({
      name: "Sami",
      netCents: -30000,
      owes: [{ name: "Abenezer", cents: 90000 }],
      owedBy: [{ name: "Hana", cents: 15000 }],
      paidCents: 30000,
      paidCount: 1,
    });
  });

  it("returns a null asker for someone who is not a member", () => {
    expect(computeLedgerSnapshot({ ...base, askerTelegramId: 99n }).asker).toBeNull();
  });

  it("sorts balances and debts largest first", () => {
    const snap = computeLedgerSnapshot({ ...base, askerTelegramId: null });
    expect(snap.balances.map((b) => b.name)).toEqual(["Abenezer", "Sami", "Hana"]);
    expect(snap.openDebts[0]).toEqual({ from: "Sami", to: "Abenezer", cents: 90000 });
  });

  it("computes spending stats from expenses only, never loans", () => {
    const snap = computeLedgerSnapshot({ ...base, askerTelegramId: null });
    expect(snap.stats.weekCents).toBe(150000);
    expect(snap.stats.monthCents).toBe(150000);
    expect(snap.stats.allTimeCents).toBe(650000);
    expect(snap.stats.expenseCount).toBe(3);
    expect(snap.stats.topSpenderMonth).toEqual({ name: "Abenezer", cents: 120000 });
    expect(snap.stats.topSpenderAllTime).toEqual({ name: "Hana", cents: 500000 });
    expect(snap.stats.biggest).toEqual({ description: "Old trip", cents: 500000, payer: "Hana" });
  });

  it("lists recent expenses newest first with payer and participants", () => {
    const snap = computeLedgerSnapshot({ ...base, askerTelegramId: null });
    expect(snap.expenses[0]).toMatchObject({
      description: "Dinner",
      cents: 120000,
      payer: "Abenezer",
      participants: 3,
      isLoan: false,
    });
    expect(snap.expenses).toHaveLength(4);
  });

  it("flags which expenses the asker paid or shared", () => {
    const snap = computeLedgerSnapshot({ ...base, askerTelegramId: 2n });
    const byName = Object.fromEntries(snap.expenses.map((e) => [e.description, e]));
    expect(byName["Taxi"]).toMatchObject({ askerPaid: true, askerShared: true });
    expect(byName["Dinner"]).toMatchObject({ askerPaid: false, askerShared: true });
    expect(byName["Old trip"]).toMatchObject({ askerPaid: false, askerShared: true });
  });

  it("summarises pending drafts", () => {
    const snap = computeLedgerSnapshot({ ...base, askerTelegramId: null });
    expect(snap.pending).toEqual({
      count: 2,
      drafts: [
        { label: "Coffee", cents: 9000 },
        { label: "Snacks", cents: null },
      ],
    });
  });
});

describe("formatCents", () => {
  it("drops zero decimals and groups thousands", () => {
    expect(formatCents(120000)).toBe("1,200");
    expect(formatCents(12345)).toBe("123.45");
    expect(formatCents(-30000)).toBe("-300");
  });
});

describe("ledger allowlists", () => {
  it("exposes every amount in plain and grouped-free forms, and every name", () => {
    const snap = computeLedgerSnapshot({ ...base, askerTelegramId: 2n });
    const nums = ledgerNumberTokens(snap);
    expect(nums).toEqual(expect.arrayContaining(["1200", "300", "900", "150", "5000"]));
    expect(ledgerNames(snap)).toEqual(expect.arrayContaining(["Abenezer", "Sami", "Hana"]));
  });
});

describe("ledgerHighlights", () => {
  it("picks the asker's debts, the top spender, the biggest debtor and the top creditor", () => {
    const snap = computeLedgerSnapshot({ ...base, askerTelegramId: 2n });
    expect(ledgerHighlights(snap)).toEqual({
      currency: "ETB",
      asker_owes: [{ name: "Abenezer", amount: "900" }],
      asker_owed_by: [{ name: "Hana", amount: "150" }],
      top_spender_this_month: { name: "Abenezer", amount: "1200" },
      biggest_debtor: { name: "Hana", amount: "900" },
      top_creditor: { name: "Abenezer", amount: "1200" },
      spent_this_week: "1500",
    });
  });

  it("leaves out what does not exist", () => {
    const snap = computeLedgerSnapshot({
      ...base,
      liveExpenses: [],
      nets: [],
      transfers: [],
      askerTelegramId: null,
    });
    expect(ledgerHighlights(snap)).toEqual({ currency: "ETB", spent_this_week: "0" });
  });
});
