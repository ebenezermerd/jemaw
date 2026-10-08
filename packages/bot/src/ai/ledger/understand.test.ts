import { describe, it, expect } from "vitest";
import { understandMessage } from "./understand.js";

const replying = (json: unknown) => ({ suggest: async () => ({ json }) });

describe("understandMessage", () => {
  it("turns the model's reading into an intent and a full query", async () => {
    const u = await understandMessage({
      client: replying({ intent: "ledger", kind: "expense_list", period: "all", days: 5, limit: null, mine: "paid" }),
      text: "list my latest 5 days expenses jemaw",
    });
    expect(u).toEqual({
      intent: "ledger",
      query: { kind: "expense_list", period: "all", days: 5, mine: "paid" },
    });
  });

  it("passes the previous question so a complaint can be re-answered", async () => {
    let prompt = "";
    const u = await understandMessage({
      client: {
        suggest: async (i) => {
          prompt = i.userPrompt;
          return { json: { intent: "correction", kind: "expense_list", period: "all", days: null, limit: 5, mine: "paid" } };
        },
      },
      text: "woo, this is mixed i said what i paid, jemaw",
      previous: { text: "list my latest 5 days expenses jemaw", kind: "expense_list" },
    });
    expect(JSON.parse(prompt).previous_question).toBe("list my latest 5 days expenses jemaw");
    expect(u?.intent).toBe("correction");
    expect(u?.query).toEqual({ kind: "expense_list", period: "all", limit: 5, mine: "paid" });
  });

  it("drops the query for chat and scan", async () => {
    const u = await understandMessage({
      client: replying({ intent: "chat", kind: "overview", period: "all", days: null, limit: null, mine: null }),
      text: "hello jemaw",
    });
    expect(u).toEqual({ intent: "chat" });
  });

  it("returns null on output that does not fit the schema", async () => {
    expect(
      await understandMessage({ client: replying({ intent: "dance" }), text: "jemaw?" }),
    ).toBeNull();
    expect(
      await understandMessage({ client: replying({ intent: "ledger", kind: null }), text: "jemaw?" }),
    ).toBeNull();
  });

  it("returns null when the model fails or is too slow", async () => {
    expect(
      await understandMessage({ client: { suggest: async () => { throw new Error("down"); } }, text: "x" }),
    ).toBeNull();
    expect(
      await understandMessage({
        client: { suggest: () => new Promise(() => {}) },
        text: "x",
        timeoutMs: 10,
      }),
    ).toBeNull();
  });

  it("clamps silly numbers", async () => {
    const u = await understandMessage({
      client: replying({ intent: "ledger", kind: "expense_list", period: "all", days: 9999, limit: 0, mine: null }),
      text: "x",
    });
    expect(u?.query).toEqual({ kind: "expense_list", period: "all", days: 365 });
  });
});
