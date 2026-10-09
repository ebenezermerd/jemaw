import { describe, it, expect } from "vitest";
import { DEFAULT_BOT_RUNTIME_CONFIG, limitsFromHeaders, parseResetSeconds, runtimeConfigFromRows } from "./runtimeConfig.js";

describe("runtimeConfigFromRows", () => {
  it("uses the defaults when nothing is stored", () => {
    expect(runtimeConfigFromRows([])).toEqual(DEFAULT_BOT_RUNTIME_CONFIG);
  });

  it("reads stored values and ignores off-type ones", () => {
    const c = runtimeConfigFromRows([
      { key: "bot.ai.scanEnabled", value: false },
      { key: "bot.ai.chatEnabled", value: "nope" },
      { key: "bot.ai.model", value: "  openai/gpt-oss-20b " },
      { key: "bot.ai.scanCooldownSeconds", value: 2 },
      { key: "bot.maintenanceMessage", value: "" },
      { key: "admins", value: { emails: [] } },
    ]);
    expect(c.scanEnabled).toBe(false);
    expect(c.chatEnabled).toBe(true);
    expect(c.model).toBe("openai/gpt-oss-20b");
    expect(c.scanCooldownSeconds).toBe(5);
    expect(c.maintenanceMessage).toBeNull();
  });
});

describe("limitsFromHeaders", () => {
  it("reads Groq's rate-limit headers", () => {
    const h = new Map([
      ["x-ratelimit-limit-requests", "1000"],
      ["x-ratelimit-remaining-requests", "987"],
      ["x-ratelimit-reset-requests", "1m26.4s"],
      ["x-ratelimit-limit-tokens", "8000"],
      ["x-ratelimit-remaining-tokens", "7421"],
      ["x-ratelimit-reset-tokens", "4.33s"],
    ]);
    const s = limitsFromHeaders((n) => h.get(n) ?? null, { model: "m", source: "bot", now: new Date(0) });
    expect(s).toEqual({
      at: "1970-01-01T00:00:00.000Z",
      provider: "groq",
      model: "m",
      source: "bot",
      requests: { limit: 1000, remaining: 987, resetSeconds: 86.4 },
      tokens: { limit: 8000, remaining: 7421, resetSeconds: 4.3 },
    });
  });

  it("returns null when there are no limit headers", () => {
    expect(limitsFromHeaders(() => null, { model: "m", source: "bot", now: new Date() })).toBeNull();
    expect(parseResetSeconds("2h1m")).toBe(7260);
    expect(parseResetSeconds("120ms")).toBe(0.1);
  });
});
