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

  it("accepts draft amounts from the fact packet", () => {
    const rich = buildScanOutcomePacket({
      written: 0,
      pendingCount: 3,
      drafts: [
        { label: "Lunch", amount: "600" },
        { label: "Dinner", amount: "2500" },
      ],
    });
    const r = verifyCandidate(
      "Lunch 600 and Dinner 2500 are still waiting. 3 drafts total.",
      rich,
    );
    expect(r.ok).toBe(true);
  });

  it("allows slightly longer grounded replies", () => {
    const rich = buildScanOutcomePacket({
      written: 0,
      pendingCount: 2,
      drafts: [{ label: "Ride", amount: "150" }],
    });
    const text =
      "Ride for 150 is still open, and 2 drafts are waiting for a decision.";
    expect(verifyCandidate(text, rich).ok).toBe(true);
  });
});

describe("scoreGrounding", () => {
  it("ranks specific draft mentions higher", async () => {
    const { scoreGrounding } = await import("./modelComposer.js");
    const rich = buildScanOutcomePacket({
      written: 0,
      pendingCount: 2,
      drafts: [
        { label: "Lunch", amount: "600" },
        { label: "Dinner", amount: "2500" },
      ],
    });
    const specific = scoreGrounding(
      "Lunch 600 and Dinner 2500 still waiting — 2 drafts open.",
      rich,
    );
    const generic = scoreGrounding("A few things are still pending.", rich);
    expect(specific).toBeGreaterThan(generic);
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
