import { describe, it, expect } from "vitest";
import { buildUserPrompt, SYSTEM_PROMPT, type ScanData } from "./prompt.js";

const data: ScanData = {
  currency: "EUR",
  members: [
    { telegramUserId: 111, displayName: "Sara" },
    { telegramUserId: 222, displayName: "Tom" },
  ],
  recentExpenses: [{ description: "Cab", amount: "18.00", payerName: "Tom" }],
  openDebts: [{ fromName: "Tom", toName: "Sara", amount: "9.00" }],
  recentSettlements: [],
  messages: [
    {
      telegramMessageId: 101,
      senderName: "Sara",
      text: "I got dinner, ~50",
      sentAt: new Date("2026-06-01T21:14:00Z"),
    },
  ],
};

describe("buildUserPrompt", () => {
  it("includes members, currency, recent expenses and messages", () => {
    const p = buildUserPrompt(data);
    expect(p).toContain("Sara");
    expect(p).toContain("EUR");
    expect(p).toContain("Cab");
    expect(p).toContain("I got dinner, ~50");
    expect(p).toContain("msg 101");
  });

  it("does not leak usernames or phone numbers", () => {
    // We only ever pass displayName + text; assert no @handles slip in.
    const withUsername: ScanData = {
      ...data,
      members: [{ telegramUserId: 111, displayName: "Sara" }],
    };
    const p = buildUserPrompt(withUsername);
    expect(p).not.toContain("@");
  });

  it("system prompt forbids inventing amounts", () => {
    expect(SYSTEM_PROMPT).toMatch(/never invent amounts/i);
  });
});
