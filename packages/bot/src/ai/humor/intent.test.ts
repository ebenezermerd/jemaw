import { describe, it, expect } from "vitest";
import {
  classifyJemawIntent,
  classifyLedgerQuestion,
  chatLoadingTopic,
  parseLedgerQuery,
  ledgerPeriod,
  sanitizeAddressedUtterance,
  stripJemawToken,
} from "./intent.js";

describe("classifyJemawIntent", () => {
  it("treats bare jemaw as scan", () => {
    expect(classifyJemawIntent("jemaw")).toBe("scan");
    expect(classifyJemawIntent("Jemaw!")).toBe("scan");
    expect(classifyJemawIntent("  jemaw  ")).toBe("scan");
  });

  it("routes social banter to chat", () => {
    expect(classifyJemawIntent("hey jemaw what's up?")).toBe("chat");
    expect(classifyJemawIntent("you cooking something jemaw?")).toBe("chat");
    expect(classifyJemawIntent("jemaw how are you")).toBe("chat");
    expect(classifyJemawIntent("yo jemaw")).toBe("chat");
    expect(classifyJemawIntent("jemaw you good?")).toBe("chat");
  });

  it("routes explicit scan requests and money statements to scan", () => {
    expect(classifyJemawIntent("jemaw check pending")).toBe("scan");
    expect(classifyJemawIntent("jemaw we spent on lunch")).toBe("scan");
    expect(classifyJemawIntent("jemaw any new expenses?")).toBe("scan");
    expect(classifyJemawIntent("jemaw scan please")).toBe("scan");
    expect(classifyJemawIntent("I paid 300 for lunch jemaw")).toBe("scan");
    expect(classifyJemawIntent("jemaw Sami paid for the taxi")).toBe("scan");
  });

  it("routes ledger questions and requests to ledger", () => {
    expect(classifyJemawIntent("jemaw how much do I owe?")).toBe("ledger");
    expect(classifyJemawIntent("jemaw who hasn't paid?")).toBe("ledger");
    expect(classifyJemawIntent("what is the expenses list look like? jemaw")).toBe("ledger");
    expect(classifyJemawIntent("jemaw list this week's expenses")).toBe("ledger");
    expect(classifyJemawIntent("jemaw who spent the most this month")).toBe("ledger");
    expect(classifyJemawIntent("jemaw what's pending?")).toBe("ledger");
    expect(classifyJemawIntent("jemaw show me the balances")).toBe("ledger");
    expect(classifyJemawIntent("jemaw who owes me")).toBe("ledger");
  });
});

describe("classifyLedgerQuestion", () => {
  it("picks the kind of ledger answer", () => {
    expect(classifyLedgerQuestion("how much do I owe?")).toBe("my_balance");
    expect(classifyLedgerQuestion("who owes me")).toBe("my_balance");
    expect(classifyLedgerQuestion("what's my balance")).toBe("my_balance");
    expect(classifyLedgerQuestion("who hasn't paid?")).toBe("who_owes");
    expect(classifyLedgerQuestion("show me the balances")).toBe("who_owes");
    expect(classifyLedgerQuestion("list this week's expenses")).toBe("expense_list");
    expect(classifyLedgerQuestion("what is the expenses list look like?")).toBe("expense_list");
    expect(classifyLedgerQuestion("how much did we spend this month")).toBe("totals");
    expect(classifyLedgerQuestion("who spent the most")).toBe("totals");
    expect(classifyLedgerQuestion("what's pending?")).toBe("pending");
    expect(classifyLedgerQuestion("give me a summary")).toBe("overview");
  });
});

describe("ledgerPeriod", () => {
  it("reads week, month or all time from the question", () => {
    expect(ledgerPeriod("list this week's expenses")).toBe("week");
    expect(ledgerPeriod("how much this month")).toBe("month");
    expect(ledgerPeriod("show all expenses")).toBe("all");
  });
});

describe("stripJemawToken", () => {
  it("removes the keyword", () => {
    expect(stripJemawToken("hey jemaw what's up?")).toBe("hey what's up?");
  });
});

describe("sanitizeAddressedUtterance", () => {
  it("bounds length and strips urls", () => {
    const s = sanitizeAddressedUtterance(
      "hey jemaw see https://evil.example/x " + "a".repeat(200),
      80,
    );
    expect(s.length).toBeLessThanOrEqual(80);
    expect(s).not.toMatch(/https?:/);
  });
});

describe("chatLoadingTopic", () => {
  it("spots greetings, check-ins and everything else", () => {
    expect(chatLoadingTopic("hello jemaw")).toBe("greeting");
    expect(chatLoadingTopic("yo jemaw")).toBe("greeting");
    expect(chatLoadingTopic("you sick jemaw ?")).toBe("checkin");
    expect(chatLoadingTopic("jemaw how are you")).toBe("checkin");
    expect(chatLoadingTopic("who is this i am talking to? jemaw")).toBe("chat");
  });
});

describe("the conversation that went wrong", () => {
  it("routes each message the way it was meant", () => {
    expect(classifyJemawIntent("who am i ? jemaw")).toBe("ledger");
    expect(classifyJemawIntent("do i own anything on the ledger? jemaw")).toBe("ledger");
    expect(classifyJemawIntent("list my latest 5 days expenses jemaw")).toBe("ledger");
    expect(classifyJemawIntent("where is the expenses i paid latest 5 of them ? jemaw")).toBe("ledger");
  });

  it("treats complaints as corrections only when there is something to correct", () => {
    const prev = { hasPrevious: true };
    expect(classifyJemawIntent("woo, this is mixed i said what i paid, jemaw", prev)).toBe("correction");
    expect(classifyJemawIntent("you crazy? jemaw what did i said and what are you responding ?jemaw", prev)).toBe("correction");
    expect(classifyJemawIntent("woo, this is mixed i said what i paid, jemaw")).not.toBe("correction");
  });
});

describe("parseLedgerQuery", () => {
  it("answers who am i plainly", () => {
    expect(parseLedgerQuery("who am i ? jemaw").kind).toBe("whoami");
  });

  it("forgives owe typos", () => {
    expect(parseLedgerQuery("do i own anything on the ledger?").kind).toBe("my_balance");
  });

  it("reads 'my', a day window and a count", () => {
    expect(parseLedgerQuery("list my latest 5 days expenses")).toEqual({
      kind: "expense_list",
      period: "all",
      days: 5,
      mine: "paid",
    });
    expect(parseLedgerQuery("where is the expenses i paid latest 5 of them ?")).toEqual({
      kind: "expense_list",
      period: "all",
      limit: 5,
      mine: "paid",
    });
  });

  it("keeps owing questions about expenses as balance questions", () => {
    expect(parseLedgerQuery("how much do I owe for the expenses?").kind).toBe("my_balance");
    expect(parseLedgerQuery("who hasn't paid?").kind).toBe("who_owes");
  });

  it("totals what I paid", () => {
    expect(parseLedgerQuery("how much did i spend this month")).toEqual({
      kind: "totals",
      period: "month",
      mine: "paid",
    });
  });
});

describe("leaderboard questions", () => {
  it("routes rich and broke questions to the leaderboard", () => {
    expect(classifyJemawIntent("Who is the rich guy in this group? Jemaw")).toBe("ledger");
    expect(parseLedgerQuery("Who is the rich guy in this group? Jemaw").kind).toBe("leaderboard");
    expect(parseLedgerQuery("jemaw who is the broke one").kind).toBe("leaderboard");
    expect(parseLedgerQuery("jemaw who's the biggest spender here").kind).toBe("leaderboard");
    expect(parseLedgerQuery("jemaw who owes the most").kind).toBe("leaderboard");
    expect(parseLedgerQuery("jemaw who is the cheapest").kind).toBe("leaderboard");
  });

  it("keeps plain spending totals as totals", () => {
    expect(parseLedgerQuery("who spent the most this month").kind).toBe("totals");
  });
});
