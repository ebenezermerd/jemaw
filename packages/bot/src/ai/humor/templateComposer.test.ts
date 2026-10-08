import { describe, it, expect } from "vitest";
import { composeFromTemplates, renderPlaceholders } from "./templateComposer.js";
import { buildScanOutcomePacket } from "./factPacket.js";

describe("templateComposer", () => {
  it("renders still-pending copy without claiming new finds", () => {
    const packet = buildScanOutcomePacket({ written: 0, pendingCount: 3 });
    const reply = composeFromTemplates("jemaw_dry", packet, () => 0);
    expect(reply).not.toBeNull();
    expect(reply!.text).toContain("3");
    expect(reply!.text.toLowerCase()).not.toMatch(/new draft/);
    expect(reply!.source).toBe("template");
  });

  it("renders fresh finds with new_written", () => {
    const packet = buildScanOutcomePacket({ written: 2, pendingCount: 4 });
    const reply = composeFromTemplates("jemaw_dry", packet, () => 0);
    expect(reply).not.toBeNull();
    expect(reply!.text).toContain("2");
  });

  it("returns null when mode is off", () => {
    const packet = buildScanOutcomePacket({ written: 1, pendingCount: 1 });
    expect(composeFromTemplates("off", packet)).toBeNull();
  });

  it("leaves unknown placeholders for rejection", () => {
    const packet = buildScanOutcomePacket({ written: 1, pendingCount: 1 });
    const out = renderPlaceholders("Pay {{secret_amount}} now", packet);
    expect(out).toContain("{{secret_amount}}");
  });
});
