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
  recentExpenses: [
    {
      description: "Dinner",
      cents: 120000,
      payer: "Abenezer",
      occurredAt: new Date("2026-10-07T18:00:00Z"),
      participants: 3,
      isLoan: false,
    },
    {
      description: "Old trip",
      cents: 500000,
      payer: "Hana",
      occurredAt: new Date("2026-08-20T10:00:00Z"),
      participants: 3,
      isLoan: false,
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
    const html = renderLedgerFacts("my_balance", "all", snap, now);
    expect(html).toContain("You owe <b>Abenezer</b> 900 ETB.");
    expect(html).toContain("<b>Hana</b> owes you 150 ETB.");
  });

  it("says all square when the asker owes nothing either way", () => {
    const square = { ...snap, asker: { name: "Sami", netCents: 0, owes: [], owedBy: [] } };
    expect(renderLedgerFacts("my_balance", "all", square, now)).toContain("all square");
  });

  it("explains when it cannot find the asker", () => {
    const html = renderLedgerFacts("my_balance", "all", { ...snap, asker: null }, now);
    expect(html).toMatch(/can't find you/i);
  });

  it("lists who owes whom", () => {
    const html = renderLedgerFacts("who_owes", "all", snap, now);
    expect(html).toContain("<b>Sami</b> → <b>Abenezer</b> · 900 ETB");
    expect(html).toContain("<b>Hana</b> → <b>Sami</b> · 150 ETB");
  });

  it("filters the expense list by period", () => {
    const week = renderLedgerFacts("expense_list", "week", snap, now);
    expect(week).toContain("Dinner");
    expect(week).not.toContain("Old trip");
    expect(renderLedgerFacts("expense_list", "all", snap, now)).toContain("Old trip");
  });

  it("reports totals, top spender and biggest expense", () => {
    const html = renderLedgerFacts("totals", "month", snap, now);
    expect(html).toContain("1,200 ETB");
    expect(html).toContain("<b>Abenezer</b>");
    expect(html).toContain("Old trip");
  });

  it("lists pending drafts, including ones without an amount", () => {
    const html = renderLedgerFacts("pending", "all", snap, now);
    expect(html).toContain("2 drafts waiting");
    expect(html).toContain("Coffee · 90 ETB");
    expect(html).toContain("Snacks · amount unknown");
  });

  it("escapes names so chat HTML cannot break", () => {
    const evil = { ...snap, openDebts: [{ from: "<i>x</i>", to: "Sami", cents: 100 }] };
    expect(renderLedgerFacts("who_owes", "all", evil, now)).toContain("&lt;i&gt;x&lt;/i&gt;");
  });
});
