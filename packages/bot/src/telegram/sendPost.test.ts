import { describe, expect, it, vi } from "vitest";
import { InputFile, type Api } from "grammy";
import { composePost, DEFAULT_POST_DESIGNS, SAMPLE_POST_DATA, type PostDesign } from "@jemaw/shared/posts";
import { sendPost } from "./sendPost.js";

const ctx = { openUrl: "https://t.me/jemawsbot/app?startapp=g1" };
const png = async () => Buffer.from("png");

function fakeApi(opts: { richFails?: boolean } = {}) {
  const raw = {
    sendRichMessage: vi.fn(async (_payload: Record<string, unknown>) => {
      if (opts.richFails) throw new Error("400: Bad Request: unsupported");
      return { message_id: 11 };
    }),
    editMessageText: vi.fn(async (_payload: Record<string, unknown>) => true),
  };
  const api = {
    raw,
    sendPhoto: vi.fn(async () => ({ message_id: 21 })),
    sendMessage: vi.fn(async () => ({ message_id: 31 })),
    editMessageText: vi.fn(async () => true),
  };
  return { api: api as unknown as Api, raw, calls: api };
}

const weekly = (patch: Partial<PostDesign> = {}) =>
  composePost(SAMPLE_POST_DATA.weekly, { ...DEFAULT_POST_DESIGNS.weekly, ...patch }, ctx);

describe("sendPost", () => {
  it("uploads the hero inside the rich message and keeps buttons as keyboard rows below", async () => {
    const { api, raw } = fakeApi();
    const sent = await sendPost(api, -100, weekly(), { renderImage: png });
    expect(sent).toEqual({ messageId: 11, mode: "rich" });
    const payload = raw.sendRichMessage.mock.calls[0]![0] as unknown as { rich_message: { blocks: { photo?: { media: unknown } }[] }; reply_markup?: unknown };
    expect(payload.rich_message.blocks[0]!.photo!.media).toBeInstanceOf(InputFile);
    expect(payload.reply_markup).toEqual({ inline_keyboard: weekly().keyboard });
  });

  it("buttons inside the message send no keyboard", async () => {
    const { api, raw } = fakeApi();
    await sendPost(api, -100, weekly({ buttonsPlacement: "inside" }), { renderImage: png });
    expect((raw.sendRichMessage.mock.calls[0]![0] as { reply_markup?: unknown }).reply_markup).toBeUndefined();
  });

  it("falls back to the classic photo post when Telegram refuses the rich one", async () => {
    const { api, calls } = fakeApi({ richFails: true });
    const sent = await sendPost(api, -100, weekly({ sections: { ...DEFAULT_POST_DESIGNS.weekly.sections, expenses: false } }), { renderImage: png });
    expect(sent.mode).toBe("fallback");
    expect(calls.sendPhoto).toHaveBeenCalledOnce();
    const opts = (calls.sendPhoto.mock.calls[0] as unknown[])[2] as { parse_mode: string; reply_markup: unknown };
    expect(opts.parse_mode).toBe("HTML");
    expect(opts.reply_markup).toEqual({ inline_keyboard: weekly().keyboard });
  });

  it("edits a text-only rich post into the placeholder", async () => {
    const { api, raw } = fakeApi();
    const post = composePost(SAMPLE_POST_DATA.ai_payments, DEFAULT_POST_DESIGNS.ai_payments, ctx);
    const sent = await sendPost(api, -100, post, { editMessageId: 5 });
    expect(sent).toEqual({ messageId: 5, mode: "rich" });
    expect(raw.editMessageText).toHaveBeenCalledOnce();
    expect(raw.sendRichMessage).not.toHaveBeenCalled();
  });

  it("sends the classic layout as HTML text with its keyboard", async () => {
    const { api, calls, raw } = fakeApi();
    const post = composePost(SAMPLE_POST_DATA.announcement, { ...DEFAULT_POST_DESIGNS.announcement, layout: "classic" }, ctx);
    const sent = await sendPost(api, -100, post);
    expect(sent).toEqual({ messageId: 31, mode: "classic" });
    expect(raw.sendRichMessage).not.toHaveBeenCalled();
    expect(calls.sendMessage).toHaveBeenCalledWith(-100, post.html, expect.objectContaining({ reply_markup: { inline_keyboard: post.keyboard } }));
  });
});
