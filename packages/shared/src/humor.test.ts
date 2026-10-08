import { describe, it, expect } from "vitest";
import {
  DEFAULT_HUMOR_SETTINGS,
  parseHumorSettings,
  toHumorSettingsDto,
  HUMOR_MODE_LIMITS,
  applyHumorPatch,
} from "./humor.js";

describe("ledgerBanter", () => {
  it("is on by default, including for groups saved before it existed", () => {
    expect(DEFAULT_HUMOR_SETTINGS.ledgerBanter).toBe(true);
    expect(parseHumorSettings({ mode: "roast" }).ledgerBanter).toBe(true);
  });

  it("keeps an explicit off and exposes it on the DTO", () => {
    const s = parseHumorSettings({ mode: "roast", ledgerBanter: false });
    expect(s.ledgerBanter).toBe(false);
    expect(toHumorSettingsDto(s).ledgerBanter).toBe(false);
  });
});

describe("parseHumorSettings", () => {
  it("defaults missing settings to off", () => {
    expect(parseHumorSettings(undefined).mode).toBe("off");
    expect(parseHumorSettings(null).mode).toBe("off");
  });

  it("accepts a valid dry mode payload", () => {
    const s = parseHumorSettings({
      version: 1,
      mode: "jemaw_dry",
      maxPublicRepliesPerDay: 2,
    });
    expect(s.mode).toBe("jemaw_dry");
    expect(s.maxPublicRepliesPerDay).toBe(2);
    expect(s.publicRepliesEnabled).toBe(true);
  });

  it("rejects unknown modes by falling back to defaults", () => {
    expect(parseHumorSettings({ mode: "silly" }).mode).toBe("off");
  });
});

describe("HUMOR_MODE_LIMITS", () => {
  it("keeps dry quieter than chaos", () => {
    expect(HUMOR_MODE_LIMITS.jemaw_dry.maxPublicRepliesPerDay).toBeLessThan(
      HUMOR_MODE_LIMITS.chaos.maxPublicRepliesPerDay,
    );
  });

  it("matches product defaults for dry", () => {
    expect(DEFAULT_HUMOR_SETTINGS.maxPublicRepliesPerDay).toBe(
      HUMOR_MODE_LIMITS.jemaw_dry.maxPublicRepliesPerDay,
    );
  });
});

describe("applyHumorPatch", () => {
  const now = new Date("2026-10-08T10:00:00Z");

  it("rejects an unknown mode", () => {
    expect(applyHumorPatch(DEFAULT_HUMOR_SETTINGS, { mode: "spicy" }, { now })).toEqual({ error: "invalid mode" });
  });

  it("switching mode stamps the actor and applies that mode's limits", () => {
    const next = applyHumorPatch(DEFAULT_HUMOR_SETTINGS, { mode: "chaos" }, { actorMemberId: "m1", now });
    expect(next).toMatchObject({
      mode: "chaos",
      enabledByMemberId: "m1",
      enabledAt: now.toISOString(),
      maxPublicRepliesPerDay: HUMOR_MODE_LIMITS.chaos.maxPublicRepliesPerDay,
    });
  });

  it("clamps numbers, ignores bad values and handles mute", () => {
    const next = applyHumorPatch(
      DEFAULT_HUMOR_SETTINGS,
      { maxPublicRepliesPerDay: 500, cooldownMinutes: -3, ledgerBanter: "yes", useGroupVibe: false, muteDays: 2 },
      { now },
    ) as ReturnType<typeof parseHumorSettings>;
    expect(next.maxPublicRepliesPerDay).toBe(100);
    expect(next.cooldownMinutes).toBe(0);
    expect(next.ledgerBanter).toBe(DEFAULT_HUMOR_SETTINGS.ledgerBanter);
    expect(next.useGroupVibe).toBe(false);
    expect(next.mutedUntil).toBe("2026-10-10T10:00:00.000Z");
    const unmuted = applyHumorPatch(next, { muteDays: 0 }, { now }) as typeof next;
    expect(unmuted.mutedUntil).toBeUndefined();
  });
});
