import { describe, it, expect } from "vitest";
import { aiBlocked, parseGroupAccess } from "./groupAccess.js";

const now = new Date("2026-10-09T12:00:00Z");

describe("parseGroupAccess", () => {
  it("defaults to active with no limit", () => {
    expect(parseGroupAccess(undefined, now)).toEqual({ status: "active", until: null, reason: null, aiDailyLimit: null });
  });

  it("keeps a running suspension and lifts an expired one", () => {
    expect(parseGroupAccess({ status: "suspended", until: "2026-10-10T00:00:00Z", reason: " spam " }, now)).toMatchObject({
      status: "suspended",
      reason: "spam",
    });
    expect(parseGroupAccess({ status: "ai_paused", until: "2026-10-09T11:00:00Z" }, now).status).toBe("active");
  });

  it("ignores junk", () => {
    expect(parseGroupAccess({ status: "nope", aiDailyLimit: -3 }, now)).toMatchObject({ status: "active", aiDailyLimit: null });
  });
});

describe("aiBlocked", () => {
  it("blocks for pause, suspension and a used-up daily limit", () => {
    const base = parseGroupAccess(undefined, now);
    expect(aiBlocked(base, 999)).toBeNull();
    expect(aiBlocked({ ...base, aiDailyLimit: 20 }, 19)).toBeNull();
    expect(aiBlocked({ ...base, aiDailyLimit: 20 }, 20)).toBe("limit");
    expect(aiBlocked({ ...base, status: "ai_paused" }, 0)).toBe("paused");
    expect(aiBlocked({ ...base, status: "suspended" }, 0)).toBe("suspended");
  });
});
