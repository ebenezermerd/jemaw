import { describe, it, expect } from "vitest";
import { startGroupText, helpText, createBot, scanResultLine } from "./bot.js";

describe("bot copy", () => {
  it("start fallback names Jemaw without cute filler", () => {
    const t = startGroupText();
    expect(t).toContain("Jemaw");
    expect(t).not.toMatch(/🎉|🥳|!{2,}/);
  });

  it("help text lists the commands that exist and how to just ask", () => {
    const t = helpText();
    for (const cmd of ["/jemaw", "/balance", "/history", "/digest", "/help"]) {
      expect(t).toContain(cmd);
    }
    expect(t).not.toContain("/settle");
    expect(t).not.toContain("/add");
    expect(t).toMatch(/how much do I owe/i);
  });
});

describe("scanResultLine", () => {
  const base = { evidenceMessageIds: [] };
  it("reports new drafts", () => {
    expect(scanResultLine({ ...base, status: "success", written: 2, pendingCount: 5 })).toBe(
      "Found 2 new drafts. 5 waiting for review in the app.",
    );
  });
  it("reports nothing new with a backlog", () => {
    expect(scanResultLine({ ...base, status: "success", written: 0, pendingCount: 1 })).toBe(
      "Nothing new. 1 draft still waiting for review.",
    );
  });
  it("reports nothing at all", () => {
    expect(scanResultLine({ ...base, status: "no_messages", written: 0, pendingCount: 0 })).toBe(
      "Nothing new to record.",
    );
  });
  it("owns up to a failed scan", () => {
    expect(scanResultLine({ ...base, status: "api_error", written: 0, pendingCount: 0 })).toMatch(
      /tripped/,
    );
  });
});

describe("createBot", () => {
  it("constructs a bot with the given token", () => {
    const bot = createBot("123:abc", {
      db: {} as never,
      defaultCurrency: "EUR",
      miniAppUrl: undefined,
      botUsername: undefined,
      miniAppShortName: undefined,
      scanLimiter: { tryAcquire: () => true } as never,
    });
    expect(bot).toBeDefined();
    expect(bot.token).toBe("123:abc");
  });
});
