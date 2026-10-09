import { describe, it, expect, vi, afterEach } from "vitest";
import { startLoading, OPENERS, SPIRIT_LINES, FRAME_MS, MAX_FRAMES } from "./loading.js";

function fakeApi() {
  return {
    sendMessage: vi.fn(async (..._args: unknown[]) => ({ message_id: 77 })),
    editMessageText: vi.fn(async (..._args: unknown[]) => true),
    deleteMessage: vi.fn(async (..._args: unknown[]) => true),
  };
}

afterEach(() => vi.useRealTimers());

describe("startLoading", () => {
  it("opens with a line that fits the question, as a reply", async () => {
    const api = fakeApi();
    const h = await startLoading(api as never, 5, { topic: "my_balance", replyTo: 12, rng: () => 0 });
    expect(api.sendMessage).toHaveBeenCalledWith(5, OPENERS.my_balance[0], {
      reply_parameters: { message_id: 12, allow_sending_without_reply: true },
    });
    const id = await h.finish("You owe <b>Sami</b> 300 ETB.", { parse_mode: "HTML" });
    expect(api.editMessageText).toHaveBeenLastCalledWith(5, 77, "You owe <b>Sami</b> 300 ETB.", {
      parse_mode: "HTML",
    });
    expect(id).toBe(77);
  });

  it("cycles spirit lines while waiting, never repeating, then stops", async () => {
    vi.useFakeTimers();
    const api = fakeApi();
    const h = await startLoading(api as never, 6, { topic: "scan" });
    await vi.advanceTimersByTimeAsync(FRAME_MS * (MAX_FRAMES + 3));
    const frames = api.editMessageText.mock.calls.map((c) => c[2] as string);
    expect(frames).toHaveLength(MAX_FRAMES);
    expect(new Set(frames).size).toBe(MAX_FRAMES);
    for (const f of frames) expect(SPIRIT_LINES).toContain(f);
    await h.finish("done");
    expect(api.editMessageText).toHaveBeenLastCalledWith(6, 77, "done", {});
  });

  it("stops cycling as soon as the answer is ready", async () => {
    vi.useFakeTimers();
    const api = fakeApi();
    const h = await startLoading(api as never, 7, { topic: "chat" });
    await vi.advanceTimersByTimeAsync(FRAME_MS + 10);
    await h.finish("answer");
    const before = api.editMessageText.mock.calls.length;
    await vi.advanceTimersByTimeAsync(FRAME_MS * 5);
    expect(api.editMessageText.mock.calls.length).toBe(before);
    expect(api.editMessageText).toHaveBeenLastCalledWith(7, 77, "answer", {});
  });

  it("does not open with the same line twice in a row in one chat", async () => {
    const api = fakeApi();
    await (await startLoading(api as never, 8, { topic: "greeting", rng: () => 0 })).cancel();
    await (await startLoading(api as never, 8, { topic: "greeting", rng: () => 0 })).cancel();
    const [first, second] = api.sendMessage.mock.calls.map((c) => c[1]);
    expect(first).not.toBe(second);
  });

  it("deletes the placeholder when there is nothing to say", async () => {
    const api = fakeApi();
    const h = await startLoading(api as never, 9, { topic: "chat" });
    await h.cancel();
    expect(api.deleteMessage).toHaveBeenCalledWith(9, 77);
  });

  it("sends a fresh message if the final edit fails, and cleans up the placeholder", async () => {
    const api = fakeApi();
    api.editMessageText.mockRejectedValueOnce(new Error("message to edit not found"));
    api.sendMessage.mockResolvedValueOnce({ message_id: 77 }).mockResolvedValueOnce({ message_id: 78 });
    const h = await startLoading(api as never, 10, { topic: "scan" });
    const id = await h.finish("done");
    expect(api.sendMessage).toHaveBeenLastCalledWith(10, "done", {});
    expect(api.deleteMessage).toHaveBeenCalledWith(10, 77);
    expect(id).toBe(78);
  });

  it("still delivers the answer when the placeholder could not be posted", async () => {
    const api = fakeApi();
    api.sendMessage.mockRejectedValueOnce(new Error("flood")).mockResolvedValueOnce({ message_id: 90 });
    const h = await startLoading(api as never, 11, { topic: "totals" });
    expect(await h.finish("answer")).toBe(90);
    expect(api.editMessageText).not.toHaveBeenCalled();
  });

  it("has a few openers for every topic and a big spirit pool", () => {
    for (const lines of Object.values(OPENERS)) expect(lines.length).toBeGreaterThanOrEqual(3);
    expect(SPIRIT_LINES.length).toBeGreaterThanOrEqual(30);
  });

  it("finishWith keeps a reused placeholder and removes one that was replaced", async () => {
    const api = fakeApi();
    const kept = await startLoading(api as never, 7, { topic: "my_balance" });
    expect(await kept.finishWith(async (id) => id)).toBe(77);
    expect(api.deleteMessage).not.toHaveBeenCalled();
    const replaced = await startLoading(api as never, 7, { topic: "my_balance" });
    expect(await replaced.finishWith(async () => 99)).toBe(99);
    expect(api.deleteMessage).toHaveBeenCalledWith(7, 77);
  });
});
