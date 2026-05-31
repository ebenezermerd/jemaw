import { describe, it, expect } from "vitest";
import { startGroupText, helpText, createBot } from "./bot.js";

describe("bot copy", () => {
  it("start text introduces Jemaw without cute filler", () => {
    const t = startGroupText();
    expect(t).toContain("Jemaw is here.");
    expect(t).not.toMatch(/🎉|🥳|!{2,}/);
  });

  it("help text lists the core commands", () => {
    const t = helpText();
    for (const cmd of ["/jemaw", "/balance", "/settle", "/add", "/history", "/help"]) {
      expect(t).toContain(cmd);
    }
  });
});

describe("createBot", () => {
  it("constructs a bot with the given token", () => {
    const bot = createBot("123:abc", {
      db: {} as never,
      defaultCurrency: "EUR",
      miniAppUrl: undefined,
    });
    expect(bot).toBeDefined();
    expect(bot.token).toBe("123:abc");
  });
});
