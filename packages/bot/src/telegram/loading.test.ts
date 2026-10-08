import { describe, it, expect, vi } from "vitest";
import { startLoading, LOADING_LINES } from "./loading.js";

function fakeApi() {
  return {
    sendMessage: vi.fn(async () => ({ message_id: 77 })),
    editMessageText: vi.fn(async () => true),
    deleteMessage: vi.fn(async () => true),
  };
}

describe("startLoading", () => {
  it("posts a funny line as a reply, then edits it into the answer", async () => {
    const api = fakeApi();
    const h = await startLoading(api as never, 5, { kind: "ledger", replyTo: 12, rng: () => 0 });
    expect(api.sendMessage).toHaveBeenCalledWith(5, LOADING_LINES.ledger[0], {
      reply_parameters: { message_id: 12, allow_sending_without_reply: true },
    });
    const id = await h.finish("You owe <b>Sami</b> 300 ETB.", { parse_mode: "HTML" });
    expect(api.editMessageText).toHaveBeenCalledWith(5, 77, "You owe <b>Sami</b> 300 ETB.", {
      parse_mode: "HTML",
    });
    expect(id).toBe(77);
  });

  it("deletes the placeholder when there is nothing to say", async () => {
    const api = fakeApi();
    const h = await startLoading(api as never, 5, { kind: "chat" });
    await h.cancel();
    expect(api.deleteMessage).toHaveBeenCalledWith(5, 77);
  });

  it("sends a fresh message if the edit fails, and cleans up the placeholder", async () => {
    const api = fakeApi();
    api.editMessageText.mockRejectedValueOnce(new Error("message to edit not found"));
    api.sendMessage.mockResolvedValueOnce({ message_id: 77 }).mockResolvedValueOnce({ message_id: 78 });
    const h = await startLoading(api as never, 5, { kind: "scan" });
    const id = await h.finish("done");
    expect(api.sendMessage).toHaveBeenLastCalledWith(5, "done", {});
    expect(api.deleteMessage).toHaveBeenCalledWith(5, 77);
    expect(id).toBe(78);
  });

  it("still delivers the answer when the placeholder could not be posted", async () => {
    const api = fakeApi();
    api.sendMessage.mockRejectedValueOnce(new Error("flood")).mockResolvedValueOnce({ message_id: 90 });
    const h = await startLoading(api as never, 5, { kind: "ledger" });
    expect(await h.finish("answer")).toBe(90);
    expect(api.editMessageText).not.toHaveBeenCalled();
  });

  it("has several lines for every kind", () => {
    for (const lines of Object.values(LOADING_LINES)) expect(lines.length).toBeGreaterThanOrEqual(3);
  });
});
