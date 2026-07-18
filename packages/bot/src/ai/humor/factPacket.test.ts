import { describe, it, expect } from "vitest";
import {
  buildScanOutcomePacket,
  collectAllowedNumberTokens,
  normalizeAmountToken,
} from "./factPacket.js";

describe("buildScanOutcomePacket", () => {
  it("marks fresh finds when written > 0", () => {
    const p = buildScanOutcomePacket({
      written: 2,
      pendingCount: 5,
      draftLabels: ["Groceries", "Ride"],
    });
    expect(p.outcome).toBe("fresh_finds");
    expect(p.event).toBe("scan_hit");
    expect(p.public_facts.new_written).toBe(2);
    expect(p.public_facts.pending_count).toBe(5);
    expect(p.public_facts.draft_labels).toEqual(["Groceries", "Ride"]);
    expect(p.reply_style_hint).toBe("grounded_companion");
  });

  it("marks still pending when written is 0 but pending remains", () => {
    const p = buildScanOutcomePacket({ written: 0, pendingCount: 3 });
    expect(p.outcome).toBe("still_pending");
    expect(p.event).toBe("scan_still_pending");
  });

  it("marks miss when nothing pending", () => {
    const p = buildScanOutcomePacket({ written: 0, pendingCount: 0 });
    expect(p.outcome).toBe("scan_miss");
  });

  it("includes draft amounts and number tokens from DB rows", () => {
    const p = buildScanOutcomePacket({
      written: 0,
      pendingCount: 3,
      currency: "ETB",
      drafts: [
        { label: "Lunch", amount: "600.00", currency: "ETB" },
        { label: "Dinner", amount: "2500", currency: "ETB" },
        { label: "Lunch", amount: "1000", currency: "ETB" },
      ],
      activeMemberCount: 4,
    });
    expect(p.public_facts.drafts?.length).toBe(3);
    expect(p.public_facts.drafts?.[0]?.amount).toBe("600");
    expect(p.allowed_number_tokens).toEqual(
      expect.arrayContaining(["0", "3", "600", "2500", "1000"]),
    );
    expect(p.public_facts.active_member_count).toBe(4);
    expect(p.allowed_claims.some((c) => c.includes("Lunch") && c.includes("600"))).toBe(
      true,
    );
  });
});

describe("normalizeAmountToken", () => {
  it("strips trailing zeros on whole amounts", () => {
    expect(normalizeAmountToken("600.00")).toBe("600");
    expect(normalizeAmountToken("12.5")).toBe("12.5");
  });
});

describe("collectAllowedNumberTokens", () => {
  it("unions counts and draft amounts", () => {
    const tokens = collectAllowedNumberTokens({
      written: 1,
      pending: 2,
      drafts: [{ label: "x", amount: "99" }],
    });
    expect(tokens).toEqual(expect.arrayContaining(["1", "2", "99"]));
  });
});
