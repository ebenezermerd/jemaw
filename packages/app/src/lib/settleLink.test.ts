import { describe, it, expect } from "vitest";
import { settleFormSearchParams } from "./settleLink.js";

describe("settleFormSearchParams", () => {
  it("builds from, to, and amount", () => {
    expect(
      settleFormSearchParams({
        fromMemberId: "a",
        toMemberId: "b",
        amount: "861.00",
      }),
    ).toBe("from=a&to=b&amount=861.00");
  });
});
