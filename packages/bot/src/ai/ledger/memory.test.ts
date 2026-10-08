import { describe, it, expect } from "vitest";
import { rememberLedgerQuestion, recallLedgerQuestion } from "./memory.js";

describe("ledger question memory", () => {
  const q = { kind: "expense_list" as const, period: "all" as const, days: 5, mine: "paid" as const };

  it("recalls the asker's last question for a while", () => {
    rememberLedgerQuestion("g1", 7n, "list my latest 5 days expenses", q, 1_000);
    expect(recallLedgerQuestion("g1", 7n, 1_000 + 60_000)?.query).toEqual(q);
  });

  it("keeps people and groups apart", () => {
    rememberLedgerQuestion("g2", 7n, "x", q, 1_000);
    expect(recallLedgerQuestion("g2", 8n, 2_000)).toBeNull();
    expect(recallLedgerQuestion("g3", 7n, 2_000)).toBeNull();
  });

  it("forgets after 15 minutes", () => {
    rememberLedgerQuestion("g4", 7n, "x", q, 0);
    expect(recallLedgerQuestion("g4", 7n, 16 * 60 * 1000)).toBeNull();
  });
});
