import { describe, it, expect } from "vitest";
import {
  formatSettlementAnnouncement,
  escapeHtml,
  groupDigits,
} from "./announcements.js";

describe("formatSettlementAnnouncement", () => {
  const base = {
    fromName: "Bob",
    toName: "Alice",
    amount: "1500.00",
    currency: "ETB",
    method: "telebirr" as const,
    expenseDescriptions: ["Dinner", "Groceries"],
    remaining: null,
    source: "app" as const,
  };

  it("announces payer, payee, amount, method, and coverage", () => {
    const msg = formatSettlementAnnouncement(base);
    expect(msg).toContain("<b>Bob</b> paid <b>Alice</b>");
    expect(msg).toContain("<b>1,500.00 ETB</b>");
    expect(msg).toContain("Telebirr");
    expect(msg).toContain("Covers: Dinner, Groceries");
    expect(msg).toContain("square now");
    expect(msg).toContain("in the app");
  });

  it("shows the remaining debt when the pair is not square", () => {
    const msg = formatSettlementAnnouncement({ ...base, remaining: "120.00" });
    expect(msg).toContain("Still open: Bob owes Alice 120.00 ETB.");
    expect(msg).not.toContain("square now");
  });

  it("collapses long coverage lists and credits AI suggestions", () => {
    const msg = formatSettlementAnnouncement({
      ...base,
      expenseDescriptions: ["A", "B", "C", "D", "E"],
      source: "suggestion",
    });
    expect(msg).toContain("Covers: A, B, C +2 more");
    expect(msg).toContain("from an AI suggestion");
  });

  it("escapes html in names and descriptions", () => {
    const msg = formatSettlementAnnouncement({
      ...base,
      fromName: "<script>",
      expenseDescriptions: ["a & b"],
    });
    expect(msg).toContain("&lt;script&gt;");
    expect(msg).toContain("a &amp; b");
  });
});

describe("helpers", () => {
  it("escapes angle brackets and ampersands", () => {
    expect(escapeHtml("<a> & </a>")).toBe("&lt;a&gt; &amp; &lt;/a&gt;");
  });
  it("groups thousands keeping sign and decimals", () => {
    expect(groupDigits("-1234567.89")).toBe("-1,234,567.89");
  });
});
