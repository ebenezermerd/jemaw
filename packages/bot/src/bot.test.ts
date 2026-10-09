import { describe, it, expect, vi } from "vitest";
import {
  startGroupText,
  helpText,
  createBot,
  scanResultLine,
  understandByRules,
  editNowMentions,
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

describe("group access notices", () => {
  it("say who paused the group, until when and why", async () => {
    const { suspendedNotice, aiBlockedLine } = await import("./bot.js");
    expect(
      suspendedNotice({ status: "suspended", until: "2026-10-12T09:00:00Z", reason: "Spam", aiDailyLimit: null }),
    ).toBe("Jemaw is paused in this group by the Jemaw team until Oct 12, 9:00 AM UTC. Reason: Spam Your records are safe.");
    expect(aiBlockedLine("limit")).toContain("today's AI allowance");
  });
});

describe("editNowMentions", () => {
  const now = Date.UTC(2026, 9, 9, 17, 0);
  const sentAt = (minutesAgo: number) => Math.floor((now - minutesAgo * 60_000) / 1000);

  it("answers a recent message edited to add jemaw or the @username", () => {
    expect(editNowMentions({ before: "how much does aman owe", after: "how much does aman owe jemaw", sentAt: sentAt(2), now })).toBe(true);
    expect(editNowMentions({ before: "who are you", after: "who are you @jemawsbot", sentAt: sentAt(10), now })).toBe(true);
  });

  it("stays quiet when the message already mentioned jemaw, so it isn't answered twice", () => {
    expect(editNowMentions({ before: "jemaw how much", after: "jemaw how much do i owe", sentAt: sentAt(1), now })).toBe(false);
  });

  it("stays quiet for old messages, edits without a mention, or an unknown original", () => {
    expect(editNowMentions({ before: "hi", after: "hi jemaw", sentAt: sentAt(45), now })).toBe(false);
    expect(editNowMentions({ before: "hi", after: "hello", sentAt: sentAt(1), now })).toBe(false);
    expect(editNowMentions({ before: undefined, after: "hi jemaw", sentAt: sentAt(1), now })).toBe(false);
  });

  it("answers when the original never reached the bot", () => {
    expect(editNowMentions({ before: null, after: "hi jemaw", sentAt: sentAt(1), now })).toBe(true);
  });
});

describe("understandByRules actions", () => {
  it("routes a clear command to an action before any question rules", () => {
    expect(understandByRules("Settle mine to pomi jemaw", null)).toEqual({
      intent: "action",
      action: { action: "settle", from: "me", to: "pomi" },
    });
    expect(understandByRules("show drafts jemaw", null)).toMatchObject({ intent: "ledger", query: { kind: "pending" } });
  });
});
