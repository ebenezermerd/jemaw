import { describe, it, expect } from "vitest";
import { verifyCandidate, isTooSimilar } from "./verifier.js";
import { buildScanOutcomePacket } from "./factPacket.js";

describe("verifyCandidate", () => {
  const packet = buildScanOutcomePacket({ written: 2, pendingCount: 3 });

  it("accepts allowed counts", () => {
    const r = verifyCandidate("2 new drafts. 3 still waiting.", packet);
    expect(r.ok).toBe(true);
  });

  it("rejects invented amounts", () => {
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
