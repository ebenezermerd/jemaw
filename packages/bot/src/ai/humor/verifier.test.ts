import { describe, it, expect } from "vitest";
import { verifyCandidate, isTooSimilar } from "./verifier.js";
import { buildScanHitPacket } from "./factPacket.js";

describe("verifyCandidate", () => {
  const packet = buildScanHitPacket({ suggestionCount: 3 });

  it("accepts a dry line with the allowed count", () => {
    const r = verifyCandidate("3 expenses found. Quiet win.", packet);
    expect(r.ok).toBe(true);
  });

  it("rejects an invented amount", () => {
    const r = verifyCandidate("You owe 999 already.", packet);
    expect(r.ok).toBe(false);
  });
});

describe("isTooSimilar", () => {
  it("flags near-duplicate replies", () => {
    expect(
      isTooSimilar("three expenses found quietly", [
        "three expenses found quietly today",
      ]),
    ).toBe(true);
  });
});
