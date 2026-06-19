import { describe, it, expect } from "vitest";
import {
  groups,
  members,
  expenses,
  expenseShares,
  settlements,
  settlementAllocations,
  suggestions,
  aiRuns,
  messages,
} from "./schema.js";
import { getTableName } from "drizzle-orm";

describe("schema", () => {
  it("defines all 9 tables", () => {
    const names = [
      groups,
      members,
      expenses,
      expenseShares,
      settlements,
      settlementAllocations,
      suggestions,
      aiRuns,
      messages,
    ].map(getTableName);

    expect(names).toEqual([
      "groups",
      "members",
      "expenses",
      "expense_shares",
      "settlements",
      "settlement_allocations",
      "suggestions",
      "ai_runs",
      "messages",
    ]);
  });

  it("uses bigint mode for telegram ids (precision-safe)", () => {
    // Column config check: chat id column must be a bigint, not a JS number map.
    const col = groups.telegramChatId;
    expect(col.dataType).toBe("bigint");
  });
});
