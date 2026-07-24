import { describe, it, expect } from "vitest";
import { settleFormSearchParams } from "./settleLink.js";
import type { TransferDto } from "@jemaw/shared/types";

describe("settleFormSearchParams", () => {
  it("includes attributed when it differs from the global amount", () => {
    const t: TransferDto = {
      fromMemberId: "a",
      toMemberId: "b",
      amount: "1287.00",
      attributedAmount: "861.00",
    };
    expect(settleFormSearchParams(t)).toBe(
      "from=a&to=b&amount=1287.00&attributed=861.00",
    );
  });

  it("omits attributed when it matches the global amount", () => {
    const t: TransferDto = {
      fromMemberId: "a",
      toMemberId: "b",
      amount: "40.00",
    };
    expect(settleFormSearchParams(t)).toBe("from=a&to=b&amount=40.00");
  });
});
