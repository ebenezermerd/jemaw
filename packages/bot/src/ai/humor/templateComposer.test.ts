import { describe, it, expect } from "vitest";
import { composeFromTemplates, renderPlaceholders } from "./templateComposer.js";
import { buildScanHitPacket } from "./factPacket.js";

describe("templateComposer", () => {
  it("fills suggestion_count from the fact packet", () => {
    const packet = buildScanHitPacket({ suggestionCount: 3 });
    const reply = composeFromTemplates("jemaw_dry", packet, () => 0);
    expect(reply).not.toBeNull();
    expect(reply!.text).toContain("3");
    expect(reply!.text).not.toContain("{{");
  });

  it("returns null when mode is off", () => {
    const packet = buildScanHitPacket({ suggestionCount: 1 });
    expect(composeFromTemplates("off", packet)).toBeNull();
  });

  it("leaves unknown placeholders so the caller can reject", () => {
    const packet = buildScanHitPacket({ suggestionCount: 1 });
    const out = renderPlaceholders("Pay {{secret_amount}} now", packet);
    expect(out).toContain("{{secret_amount}}");
  });
});
