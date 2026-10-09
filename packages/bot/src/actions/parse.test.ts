import { describe, it, expect } from "vitest";
import { parseActionByRules } from "./parse.js";

describe("parseActionByRules", () => {
  it("reads settle commands both ways", () => {
    expect(parseActionByRules("Settle mine to pomi jemaw")).toEqual({ action: "settle", from: "me", to: "pomi" });
    expect(parseActionByRules("jemaw settle pomi's to me")).toEqual({ action: "settle", from: "pomi", to: "me" });
  });

  it("reads draft, delete and add commands", () => {
    expect(parseActionByRules("jemaw approve the groceries drafts")).toEqual({ action: "approve_drafts", match: "the groceries drafts" });
    expect(parseActionByRules("@jemawsbot dismiss all drafts")).toEqual({ action: "dismiss_drafts", match: "all drafts" });
    expect(parseActionByRules("jemaw delete yesterday's lunch")).toEqual({ action: "delete_expense", match: "yesterday's lunch" });
    expect(parseActionByRules("jemaw delete my payment to pomi")).toMatchObject({ action: "delete_payment", from: "me", to: "pomi" });
    expect(parseActionByRules("jemaw add 600 for lunch with aman and pomi")).toEqual({
      action: "add_expense",
      amount: "600",
      description: "lunch",
      participants: ["aman", "pomi"],
    });
  });

  it("leaves questions and plain chat alone", () => {
    expect(parseActionByRules("jemaw who hasn't settled yet?")).toBeNull();
    expect(parseActionByRules("jemaw how much do i owe")).toBeNull();
    expect(parseActionByRules("I paid 600 for lunch jemaw")).toBeNull();
  });
});
