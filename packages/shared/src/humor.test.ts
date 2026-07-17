import { describe, it, expect } from "vitest";
import {
  DEFAULT_HUMOR_SETTINGS,
  parseHumorSettings,
  HUMOR_MODE_LIMITS,
} from "./humor.js";

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
