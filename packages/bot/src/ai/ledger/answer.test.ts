import { describe, it, expect } from "vitest";
import { renderLedgerFacts } from "./answer.js";
import type { LedgerSnapshot } from "./snapshot.js";

const snap: LedgerSnapshot = {
  currency: "ETB",
  asker: {
    name: "Sami",
    netCents: -75000,
    owes: [{ name: "Abenezer", cents: 90000 }],
    owedBy: [{ name: "Hana", cents: 15000 }],
    paidCents: 0,
    paidCount: 0,
  },
  balances: [
    { name: "Abenezer", netCents: 120000 },
    { name: "Sami", netCents: -75000 },
    { name: "Hana", netCents: -45000 },
  ],
  openDebts: [
    { from: "Sami", to: "Abenezer", cents: 90000 },
    { from: "Hana", to: "Abenezer", cents: 30000 },
    { from: "Hana", to: "Sami", cents: 15000 },
  ],
  expenses: [
    {
      description: "Dinner",
      cents: 120000,
      payer: "Abenezer",
      occurredAt: new Date("2026-10-07T18:00:00Z"),
      participants: 3,
      isLoan: false,
      askerPaid: false,
      askerShared: true,
    },
    {
      description: "Old trip",
      cents: 500000,
      payer: "Hana",
      occurredAt: new Date("2026-08-20T10:00:00Z"),
      participants: 3,
      isLoan: false,
      askerPaid: false,
      askerShared: true,
    },
  ],
  stats: {
    weekCents: 120000,
    monthCents: 120000,
    allTimeCents: 620000,
    expenseCount: 2,
    topSpenderMonth: { name: "Abenezer", cents: 120000 },
    topSpenderAllTime: { name: "Abenezer", cents: 120000 },
    biggest: { description: "Old trip", cents: 500000, payer: "Hana" },
  },
  pending: { count: 2, drafts: [{ label: "Coffee", cents: 9000 }, { label: "Snacks", cents: null }] },
};

const now = new Date("2026-10-08T12:00:00Z");

describe("renderLedgerFacts", () => {
  it("answers the asker's own balance in plain words", () => {
    const html = renderLedgerFacts({ kind: "my_balance", period: "all" }, snap, now);
    expect(html).toContain("You owe <b>Abenezer</b> 900 ETB.");
    expect(html).toContain("<b>Hana</b> owes you 150 ETB.");
  });

  it("says all square when the asker owes nothing either way", () => {
    const square = { ...snap, asker: { ...snap.asker!, netCents: 0, owes: [], owedBy: [] } };
    expect(renderLedgerFacts({ kind: "my_balance", period: "all" }, square, now)).toContain("all square");
  });

  it("explains when it cannot find the asker", () => {
    const html = renderLedgerFacts({ kind: "my_balance", period: "all" }, { ...snap, asker: null }, now);
    expect(html).toMatch(/can't find you/i);
  });

  it("lists who owes whom", () => {
    const html = renderLedgerFacts({ kind: "who_owes", period: "all" }, snap, now);
    expect(html).toContain("<b>Sami</b> → <b>Abenezer</b> · 900 ETB");
    expect(html).toContain("<b>Hana</b> → <b>Sami</b> · 150 ETB");
  });

  it("filters the expense list by period", () => {
    const week = renderLedgerFacts({ kind: "expense_list", period: "week" }, snap, now);
    expect(week).toContain("Dinner");
    expect(week).not.toContain("Old trip");
    expect(renderLedgerFacts({ kind: "expense_list", period: "all" }, snap, now)).toContain("Old trip");
  });

  it("reports totals, top spender and biggest expense", () => {
    const html = renderLedgerFacts({ kind: "totals", period: "month" }, snap, now);
    expect(html).toContain("1,200 ETB");
    expect(html).toContain("<b>Abenezer</b>");
    expect(html).toContain("Old trip");
  });

  it("lists pending drafts, including ones without an amount", () => {
    const html = renderLedgerFacts({ kind: "pending", period: "all" }, snap, now);
    expect(html).toContain("2 drafts waiting");
    expect(html).toContain("Coffee · 90 ETB");
    expect(html).toContain("Snacks · amount unknown");
  });

  it("escapes names so chat HTML cannot break", () => {
    const evil = { ...snap, openDebts: [{ from: "<i>x</i>", to: "Sami", cents: 100 }] };
    expect(renderLedgerFacts({ kind: "who_owes", period: "all" }, evil, now)).toContain("&lt;i&gt;x&lt;/i&gt;");
  });
});

describe("renderLedgerFacts for the asker's own expenses", () => {
  const mine: LedgerSnapshot = {
    ...snap,
    asker: { ...snap.asker!, name: "Ebenezer", paidCents: 165000, paidCount: 2 },
    expenses: [
      { description: "Lunch", cents: 65000, payer: "Ebenezer", occurredAt: new Date("2026-10-03T12:00:00Z"), participants: 4, isLoan: false, askerPaid: true, askerShared: true },
      { description: "Lunch", cents: 100000, payer: "Tsin", occurredAt: new Date("2026-07-19T12:00:00Z"), participants: 4, isLoan: false, askerPaid: false, askerShared: true },
      { description: "Pizza", cents: 200000, payer: "Ebenezer", occurredAt: new Date("2026-07-05T12:00:00Z"), participants: 4, isLoan: false, askerPaid: true, askerShared: true },
      { description: "Groceries", cents: 500000, payer: "Tsin", occurredAt: new Date("2026-07-05T12:00:00Z"), participants: 2, isLoan: false, askerPaid: false, askerShared: false },
    ],
  };

  it("lists only what the asker paid, capped to the count asked", () => {
    const html = renderLedgerFacts({ kind: "expense_list", period: "all", limit: 5, mine: "paid" }, mine, now);
    expect(html).toContain("All 2 expenses you paid");
    expect(html).toContain("Pizza");
    expect(html).not.toContain("Tsin");
  });

  it("respects a day window and points to the latest one when it is empty", () => {
    const html = renderLedgerFacts({ kind: "expense_list", period: "all", days: 5, mine: "paid" }, mine, now);
    expect(html).toContain("You haven't paid for anything in the last 5 days.");
    expect(html).toContain("Your latest was Lunch · 650 ETB on Oct 3.");
  });

  it("includes shared expenses when asked for everything the asker was part of", () => {
    const html = renderLedgerFacts({ kind: "expense_list", period: "all", mine: "involved" }, mine, now);
    expect(html).toContain("Tsin");
    expect(html).not.toContain("Groceries");
  });

  it("answers who am i plainly", () => {
    const html = renderLedgerFacts({ kind: "whoami", period: "all" }, mine, now);
    expect(html).toContain("You're <b>Ebenezer</b>.");
    expect(html).toContain("2 expenses (1,650 ETB)");
  });

  it("totals what the asker paid", () => {
    const html = renderLedgerFacts({ kind: "totals", period: "all", mine: "paid" }, mine, now);
    expect(html).toContain("You paid <b>2,650 ETB</b> so far across 2 expenses.");
  });
});
