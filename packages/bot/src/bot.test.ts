import { describe, it, expect, vi } from "vitest";
import {
  startGroupText,
  helpText,
  createBot,
  scanResultLine,
  understandByRules,
} from "./bot.js";

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

describe("understandByRules", () => {
  const previous = {
    text: "list my latest 5 days expenses jemaw",
    query: { kind: "expense_list" as const, period: "all" as const, days: 5, mine: "paid" as const },
    at: 0,
  };

  it("redoes the last question when someone complains, sharpened by the complaint", () => {
    expect(understandByRules("woo, this is mixed i said what i paid, jemaw", previous)).toEqual({
      intent: "correction",
      query: { kind: "expense_list", period: "all", days: 5, mine: "paid" },
    });
    expect(
      understandByRules("where is the expenses i paid latest 5 of them ? jemaw", previous),
    ).toEqual({ intent: "ledger", query: { kind: "expense_list", period: "all", limit: 5, mine: "paid" } });
  });

  it("falls back to the previous question when the complaint says nothing new", () => {
    expect(
      understandByRules("you crazy? jemaw what did i said and what are you responding ?jemaw", previous),
    ).toEqual({ intent: "correction", query: previous.query });
  });

  it("treats a complaint with nothing to correct as chat", () => {
    expect(understandByRules("you crazy? jemaw what did i said", null)).toEqual({ intent: "chat" });
  });
});

describe("createBot error boundary", () => {
  it("swallows a failed reply so the webhook does not 500 and Telegram stops retrying", async () => {
    const bot = createBot("123:abc", {
      db: {} as never,
      defaultCurrency: "EUR",
      miniAppUrl: undefined,
      botUsername: undefined,
      miniAppShortName: undefined,
      scanLimiter: { tryAcquire: () => true } as never,
    });
    bot.botInfo = { id: 1, is_bot: true, first_name: "Jemaw", username: "jemawsbot" } as never;
    bot.api.config.use(async () => ({ ok: false, error_code: 403, description: "Forbidden: bot was blocked by the user" }) as never);
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    await expect(
      bot.handleUpdate({
        update_id: 1,
        message: {
          message_id: 1,
          date: 0,
          chat: { id: 42, type: "private", first_name: "A" },
          from: { id: 42, is_bot: false, first_name: "A" },
          text: "/help",
          entities: [{ offset: 0, length: 5, type: "bot_command" }],
        },
      }),
    ).resolves.toBeUndefined();
    expect(warn.mock.calls[0]?.join(" ")).toContain("bot was blocked by the user");
    expect(warn.mock.calls[0]?.join(" ")).not.toContain("123:abc");
    warn.mockRestore();
  });
});
