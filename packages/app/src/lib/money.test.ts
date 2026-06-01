import { describe, it, expect } from "vitest";
import { formatMoney, currencyAffix } from "./money.js";

describe("formatMoney", () => {
  it("prefixes most currencies", () => {
    expect(formatMoney("12.50", "EUR")).toBe("€12.50");
    expect(formatMoney("12.50", "USD")).toBe("$12.50");
  });

  it("suffixes Birr (symbol after the number)", () => {
    expect(formatMoney("340.00", "ETB")).toBe("340.00 Br");
  });

  it("falls back to the code prefix for unknown currencies", () => {
    expect(formatMoney("5.00", "XYZ")).toBe("XYZ 5.00");
  });
});

describe("currencyAffix", () => {
  it("reports suffix for ETB and prefix otherwise", () => {
    expect(currencyAffix("ETB").suffix).toBe(true);
    expect(currencyAffix("EUR").suffix).toBe(false);
  });
});
