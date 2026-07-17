import { describe, it, expect } from "vitest";
import { evaluateHumorPolicy } from "./interactionPolicy.js";
import { DEFAULT_HUMOR_SETTINGS } from "@jemaw/shared/humor";
import { buildScanOutcomePacket, buildScanMissPacket } from "./factPacket.js";

const base = {
  nowMs: 1_000_000,
  publicRepliesToday: 0,
  lastPublicReplyAtMs: null as number | null,
  directInvocation: true,
};

describe("evaluateHumorPolicy", () => {
  it("stays silent when mode is off", () => {
    const d = evaluateHumorPolicy({
      ...base,
      settings: { ...DEFAULT_HUMOR_SETTINGS, mode: "off" },
      factPacket: buildScanOutcomePacket({ written: 2, pendingCount: 2 }),
    });
    expect(d).toEqual({ decision: "do_not_reply", reason: "mode_off" });
  });

  it("allows a dry scan hit when invoked", () => {
    const d = evaluateHumorPolicy({
      ...base,
      settings: { ...DEFAULT_HUMOR_SETTINGS, mode: "jemaw_dry" },
      factPacket: buildScanOutcomePacket({ written: 3, pendingCount: 3 }),
    });
    expect(d.decision).toBe("reply");
  });

  it("skips cooldown on direct jemaw invocation", () => {
    const d = evaluateHumorPolicy({
      ...base,
      directInvocation: true,
      settings: {
        ...DEFAULT_HUMOR_SETTINGS,
        mode: "jemaw_dry",
        cooldownMinutes: 30,
      },
      lastPublicReplyAtMs: base.nowMs - 5 * 60_000,
      publicRepliesToday: 99,
      factPacket: buildScanOutcomePacket({ written: 1, pendingCount: 1 }),
    });
    expect(d.decision).toBe("reply");
  });

  it("enforces cooldown for passive (non jemaw) events", () => {
    const d = evaluateHumorPolicy({
      ...base,
      directInvocation: false,
      settings: {
        ...DEFAULT_HUMOR_SETTINGS,
        mode: "roast",
        cooldownMinutes: 30,
      },
      lastPublicReplyAtMs: base.nowMs - 5 * 60_000,
      factPacket: buildScanOutcomePacket({ written: 1, pendingCount: 1 }),
    });
    expect(d).toEqual({ decision: "do_not_reply", reason: "cooldown" });
  });

  it("requires direct invocation for dry scan miss", () => {
    const d = evaluateHumorPolicy({
      ...base,
      directInvocation: false,
      settings: { ...DEFAULT_HUMOR_SETTINGS, mode: "jemaw_dry" },
      factPacket: buildScanMissPacket(),
    });
    expect(d).toEqual({
      decision: "do_not_reply",
      reason: "scan_miss_requires_invocation",
    });
  });
});
