import { describe, it, expect } from "vitest";
import { formatMoney, currencyAffix, formatNumber } from "./money.js";

describe("formatNumber", () => {
  it("groups thousands and keeps decimals + sign", () => {
    expect(formatNumber("4565.49")).toBe("4,565.49");
    expect(formatNumber("1200")).toBe("1,200");
    expect(formatNumber("-1234567.8")).toBe("-1,234,567.8");
    expect(formatNumber("999")).toBe("999");
  });
});

describe("formatMoney", () => {
  it("prefixes most currencies with grouping", () => {
    expect(formatMoney("12.50", "EUR")).toBe("€12.50");
    expect(formatMoney("4565.49", "USD")).toBe("$4,565.49");
  });

  it("suffixes Birr (symbol after the number) with grouping", () => {
    expect(formatMoney("3400.00", "ETB")).toBe("3,400.00 Br");
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
