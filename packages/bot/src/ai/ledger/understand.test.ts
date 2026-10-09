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

  it("answers with everyone's open payments when the model picks the asker's or the drafts unasked", async () => {
    const mine = await understandMessage({
      client: replying({ intent: "ledger", kind: "my_balance", period: "all" }),
      text: "how much do gemechis own jemaw",
    });
    expect(mine?.query?.kind).toBe("who_owes");
    const drafts = await understandMessage({
      client: replying({ intent: "ledger", kind: "pending", period: "all" }),
      text: "Owned payments left unsettled jemaw",
    });
    expect(drafts?.query?.kind).toBe("who_owes");
    const own = await understandMessage({
      client: replying({ intent: "ledger", kind: "my_balance", period: "all" }),
      text: "how much do i owe jemaw",
    });
    expect(own?.query?.kind).toBe("my_balance");
  });

  it("keeps who am I for identity questions only", async () => {
    const asked = async (text: string) =>
      (await understandMessage({ client: replying({ intent: "ledger", kind: "whoami", period: "all" }), text }))?.query?.kind;
    expect(await asked("how much does aman owe jemaw")).toBe("who_owes");
    expect(await asked("does the other guy have unsettled expenses jemaw")).toBe("who_owes");
    expect(await asked("any unpaid payments for pomi jemaw")).toBe("who_owes");
    expect(await asked("abenezer has to pay me jemaw")).toBe("my_balance");
    expect(await asked("what did amanuel pay jemaw")).toBe("expense_list");
    expect(await asked("who am i jemaw")).toBe("whoami");
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
