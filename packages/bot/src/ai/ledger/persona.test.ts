import { describe, it, expect } from "vitest";
import { composeLedgerPersonaLine } from "./persona.js";
import type { LedgerSnapshot } from "./snapshot.js";

const snap: LedgerSnapshot = {
  currency: "ETB",
  asker: { name: "Sami", netCents: -90000, owes: [{ name: "Abenezer", cents: 90000 }], owedBy: [] },
  balances: [
    { name: "Abenezer", netCents: 120000 },
    { name: "Hana", netCents: -30000 },
    { name: "Sami", netCents: -90000 },
  ],
  openDebts: [
    { from: "Sami", to: "Abenezer", cents: 90000 },
    { from: "Hana", to: "Abenezer", cents: 30000 },
  ],
  recentExpenses: [],
  stats: {
    weekCents: 120000,
    monthCents: 120000,
    allTimeCents: 120000,
    expenseCount: 1,
    topSpenderMonth: { name: "Abenezer", cents: 120000 },
    biggest: null,
  },
  pending: { count: 0, drafts: [] },
};

const client = (texts: string[]) => ({
  async suggest() {
    return { json: { candidates: texts.map((text) => ({ text })) }, inputTokens: 10, outputTokens: 5 };
  },
});

describe("composeLedgerPersonaLine", () => {
  it("uses the first model line that only cites real names and numbers", async () => {
    const r = await composeLedgerPersonaLine({
      client: client([
        "Sami, Abenezer has been patient about those 4000 birr.",
        "Sami, Abenezer fronted 900 for you. The ledger is judging you quietly.",
      ]),
      mode: "roast",
      snapshot: snap,
      kind: "my_balance",
    });
    expect(r).toMatchObject({
      text: "Sami, Abenezer fronted 900 for you. The ledger is judging you quietly.",
      source: "model",
    });
  });

  it("falls back to a template when the model fails", async () => {
    const r = await composeLedgerPersonaLine({
      client: { suggest: async () => { throw new Error("down"); } },
      mode: "jemaw_dry",
      snapshot: snap,
      kind: "my_balance",
      rng: () => 0,
    });
    expect(r.source).toBe("template");
    expect(r.text).toContain("Sami");
  });

  it("falls back to a template with no client at all", async () => {
    const r = await composeLedgerPersonaLine({ mode: "chaos", snapshot: snap, kind: "totals", rng: () => 0 });
    expect(r.source).toBe("template");
    expect(r.text.length).toBeGreaterThan(0);
  });
});
