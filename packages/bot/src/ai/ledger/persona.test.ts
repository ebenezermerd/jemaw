import { describe, it, expect } from "vitest";
import { composeLedgerPersonaLine } from "./persona.js";
import type { LedgerSnapshot } from "./snapshot.js";

const snap: LedgerSnapshot = {
  currency: "ETB",
  asker: { name: "Sami", netCents: -90000, owes: [{ name: "Abenezer", cents: 90000 }], owedBy: [], paidCents: 0, paidCount: 0 },
  balances: [
    { name: "Abenezer", netCents: 120000 },
    { name: "Hana", netCents: -30000 },
    { name: "Sami", netCents: -90000 },
  ],
  openDebts: [
    { from: "Sami", to: "Abenezer", cents: 90000 },
    { from: "Hana", to: "Abenezer", cents: 30000 },
  ],
  expenses: [],
  stats: {
    weekCents: 120000,
    monthCents: 120000,
    allTimeCents: 120000,
    expenseCount: 1,
    topSpenderMonth: { name: "Abenezer", cents: 120000 },
    topSpenderAllTime: { name: "Abenezer", cents: 120000 },
    paidByMember: [{ name: "Abenezer", cents: 120000 }],
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
      query: { kind: "my_balance", period: "all" },
    });
    expect(r).toMatchObject({
      text: "Sami, Abenezer paid 900 for you. The ledger is judging you quietly.",
      source: "model",
    });
  });

  it("falls back to a template when the model fails", async () => {
    const r = await composeLedgerPersonaLine({
      client: { suggest: async () => { throw new Error("down"); } },
      mode: "jemaw_dry",
      snapshot: snap,
      query: { kind: "my_balance", period: "all" },
      rng: () => 0,
    });
    expect(r.source).toBe("template");
    expect(r.text).toContain("Sami");
  });

  it("falls back to a template with no client at all", async () => {
    const r = await composeLedgerPersonaLine({ mode: "chaos", snapshot: snap, query: { kind: "totals", period: "all" }, rng: () => 0 });
    expect(r.source).toBe("template");
    expect(r.text.length).toBeGreaterThan(0);
  });

  it("gives the model facts focused on the question that was asked", async () => {
    let prompt = "";
    await composeLedgerPersonaLine({
      client: {
        async suggest(i) {
          prompt = i.userPrompt;
          return { json: { candidates: [] } };
        },
      },
      mode: "roast",
      snapshot: snap,
      query: { kind: "who_owes", period: "all" },
    });
    const facts = JSON.parse(prompt.replace(/^FACTS:/, ""));
    expect(facts.focus).toEqual({
      open_debts: [
        { from: "Sami", to: "Abenezer", amount: "900" },
        { from: "Hana", to: "Abenezer", amount: "300" },
      ],
    });
  });

  it("accepts lines that mention real expense names", async () => {
    const withExpense = {
      ...snap,
      stats: { ...snap.stats, biggest: { description: "Groceries", cents: 500000, payer: "Hana" } },
    };
    const r = await composeLedgerPersonaLine({
      client: client(["Sami, Hana dropped 5000 on Groceries and you can't cover 900?"]),
      mode: "roast",
      snapshot: withExpense,
      query: { kind: "totals", period: "all" },
    });
    expect(r.source).toBe("model");
  });

  it("strips em dashes and semicolons from the line", async () => {
    const r = await composeLedgerPersonaLine({
      client: client(["Sami—our debtor—owes Abenezer 900; the ledger sighs."]),
      mode: "roast",
      snapshot: snap,
      query: { kind: "my_balance", period: "all" },
    });
    expect(r.text).toBe("Sami, our debtor, owes Abenezer 900, the ledger sighs.");
  });

  it("retries once when the model call fails", async () => {
    let calls = 0;
    const temps: (number | undefined)[] = [];
    const r = await composeLedgerPersonaLine({
      client: {
        async suggest(i) {
          calls++;
          temps.push(i.temperature);
          if (calls === 1) throw new Error("400 Failed to validate JSON");
          return { json: { candidates: [{ text: "Sami, Abenezer is still waiting on 900." }] } };
        },
      },
      mode: "roast",
      snapshot: snap,
      query: { kind: "my_balance", period: "all" },
    });
    expect(calls).toBe(2);
    expect(temps).toEqual([0.8, 0.4]);
    expect(r.source).toBe("model");
  });

  it("crowns the rich one and points at the broke one for leaderboard questions", async () => {
    let prompt = "";
    await composeLedgerPersonaLine({
      client: { async suggest(i) { prompt = i.userPrompt; return { json: { candidates: [] } }; } },
      mode: "roast",
      snapshot: snap,
      query: { kind: "leaderboard", period: "all" },
    });
    const facts = JSON.parse(prompt.replace(/^FACTS:/, ""));
    expect(facts.focus).toEqual({
      rich_one: { name: "Abenezer", paid: "1200" },
      broke_one: { name: "Sami", owes: "900" },
      owed_most: { name: "Abenezer", amount: "1200" },
    });
  });

  it("asks for a chat reply that is the whole answer for leaderboard questions", async () => {
    let system = "";
    await composeLedgerPersonaLine({
      client: { async suggest(i) { system = i.systemPrompt; return { json: { candidates: [] } }; } },
      mode: "roast",
      snapshot: snap,
      query: { kind: "leaderboard", period: "all" },
    });
    expect(system).toContain("your reply IS the whole answer");
  });

  it("falls back to a leaderboard roast that names both with their amounts", async () => {
    const r = await composeLedgerPersonaLine({
      mode: "roast",
      snapshot: snap,
      query: { kind: "leaderboard", period: "all" },
      rng: () => 0,
    });
    expect(r).toEqual({
      text: "Abenezer is clearly the group's sugar daddy with 1,200 ETB paid. Sami, 900 ETB in the hole, start saving.",
      source: "template",
    });
  });

  it("groups the digits of big numbers in a model line", async () => {
    const big = { ...snap, stats: { ...snap.stats, paidByMember: [{ name: "Abenezer", cents: 4314066 }] } };
    const r = await composeLedgerPersonaLine({
      client: client(["Abenezer fronted 43140.66 ETB and Sami still owes 900 ETB."]),
      mode: "roast",
      snapshot: big,
      query: { kind: "leaderboard", period: "all" },
    });
    expect(r.text).toBe("Abenezer paid 43,140.66 ETB and Sami still owes 900 ETB.");
  });

  it("varies the leaderboard fallback", async () => {
    const texts = new Set<string>();
    for (const n of [0, 0.3, 0.6, 0.9]) {
      const r = await composeLedgerPersonaLine({
        mode: "roast",
        snapshot: snap,
        query: { kind: "leaderboard", period: "all" },
        rng: () => n,
      });
      texts.add(r.text);
    }
    expect(texts.size).toBe(4);
  });
});
