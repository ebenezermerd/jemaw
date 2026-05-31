import { describe, it, expect } from "vitest";
import { decimalToCents, centsToDecimal } from "./types.js";

describe("decimalToCents", () => {
  it("parses whole and fractional amounts", () => {
    expect(decimalToCents("12.50")).toBe(1250);
    expect(decimalToCents("12.5")).toBe(1250);
    expect(decimalToCents("12")).toBe(1200);
    expect(decimalToCents("0.01")).toBe(1);
    expect(decimalToCents("-3.30")).toBe(-330);
  });
  it("rejects malformed strings", () => {
    expect(() => decimalToCents("abc")).toThrow();
    expect(() => decimalToCents("1.234")).toThrow();
    expect(() => decimalToCents("")).toThrow();
  });
});

describe("centsToDecimal", () => {
  it("formats cents to two-decimal strings", () => {
    expect(centsToDecimal(1250)).toBe("12.50");
    expect(centsToDecimal(1)).toBe("0.01");
    expect(centsToDecimal(0)).toBe("0.00");
    expect(centsToDecimal(-330)).toBe("-3.30");
  });
  it("round-trips", () => {
    for (const s of ["0.00", "12.50", "999.99", "-3.30"]) {
      expect(centsToDecimal(decimalToCents(s))).toBe(s);
    }
  });
});
