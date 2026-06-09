import { describe, it, expect } from "vitest";
import {
  readStoredSummary,
  getSummaryForScan,
  type AiSummary,
} from "./summary.js";
import type { Db } from "../db.js";

const sample: AiSummary = {
  version: { expenses: 3, settlements: 1 },
  currency: "ETB",
  balances: [{ name: "Abe", net: "10.00" }],
  openDebts: [{ from: "Abe", to: "Sara", amount: "5.00" }],
  recentExpenses: [{ desc: "Lunch", amount: "20.00", payer: "Sara" }],
  recentSettlements: [{ from: "Abe", to: "Sara", amount: "5.00" }],
  updatedAt: "2026-06-09T00:00:00.000Z",
};

// A db that throws if any method is touched — proves the read-only path.
const exploding = new Proxy(
  {},
  {
    get() {
      throw new Error("db should not be touched when summary is in sync");
    },
  },
) as unknown as Db;

describe("readStoredSummary", () => {
  it("returns a well-formed stored summary", () => {
    expect(readStoredSummary({ aiSummary: sample })).toEqual(sample);
  });

  it("returns null for missing or malformed summaries", () => {
    expect(readStoredSummary(null)).toBeNull();
    expect(readStoredSummary({})).toBeNull();
    expect(readStoredSummary({ aiSummary: { version: {} } })).toBeNull();
  });
});

describe("getSummaryForScan", () => {
  it("uses the stored summary without touching the db when the stamp matches", async () => {
    const out = await getSummaryForScan(
      exploding,
      "g1",
      { aiSummary: sample },
      3, // matches version.expenses
      1, // matches version.settlements
    );
    expect(out).toEqual(sample);
  });
});
