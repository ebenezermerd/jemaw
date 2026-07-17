import { describe, it, expect } from "vitest";
import { buildScanOutcomePacket } from "./factPacket.js";

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
});
