/**
 * Send a composed post through the console's Telegram client: a Rich Message
 * with its generated images uploaded alongside, or the classic HTML message
 * when the layout is classic or Telegram refuses the rich version.
 */
import type { ComposedPost, ImageSpec, RichBlock } from "@jemaw/shared/posts";
import type { TelegramClient, TgResult } from "./telegram.js";

export type ImageRenderer = (spec: ImageSpec) => Promise<Buffer>;

export interface PostSendResult {
  ok: boolean;
  mode: "rich" | "classic" | "fallback";
  messageId: number | null;
  error?: string;
  /** Why the rich version was refused, when it fell back. */
  richError?: string;
}

const IMAGE_REF = /^image:(\d+)$/;

/** Point "image:<n>" references at multipart attachments. */
function attachImages(blocks: RichBlock[]): unknown[] {
  const swap = (value: unknown): unknown => {
    if (Array.isArray(value)) return value.map(swap);
    if (value && typeof value === "object") {
      return Object.fromEntries(
        Object.entries(value).map(([k, v]) => {
          const m = k === "media" && typeof v === "string" ? IMAGE_REF.exec(v) : null;
          return [k, m ? `attach://img${m[1]}` : swap(v)];
        }),
      );
    }
    return value;
  };
  return blocks.map(swap);
}

const messageId = (r: TgResult<unknown>) =>
  r.ok ? ((r.result as { message_id?: number }).message_id ?? null) : null;

export async function sendComposedPost(
  tg: TelegramClient,
  chatId: string,
  post: ComposedPost,
  render: ImageRenderer,
): Promise<PostSendResult> {
  const keyboard = post.keyboard.length ? { inline_keyboard: post.keyboard } : undefined;
  let richError: string | undefined;
  if (post.rich) {
    try {
      const files: Record<string, Buffer> = {};
      await Promise.all(post.images.map(async (spec, i) => (files[`img${i}`] = await render(spec))));
      const params = {
        chat_id: chatId,
        rich_message: { blocks: attachImages(post.rich) },
        ...(post.buttonsPlacement === "below" && keyboard ? { reply_markup: keyboard } : {}),
      };
      const res = await tg.upload("sendRichMessage", params, files);
      if (res.ok) return { ok: true, mode: "rich", messageId: messageId(res) };
      richError = res.error;
    } catch (err) {
      richError = err instanceof Error ? err.message : String(err);
    }
  }
  const mode = post.rich ? "fallback" : "classic";
  const extra = { parse_mode: "HTML", ...(keyboard ? { reply_markup: keyboard } : {}) };
  if (post.photo && post.html.length <= 1024) {
    const res = await tg.upload("sendPhoto", { chat_id: chatId, photo: "attach://hero", caption: post.html, ...extra }, { hero: await render(post.photo) });
    if (res.ok) return { ok: true, mode, messageId: messageId(res), richError };
  }
  const res = await tg.call("sendMessage", { chat_id: chatId, text: post.html, link_preview_options: { is_disabled: true }, ...extra });
  return res.ok
    ? { ok: true, mode, messageId: messageId(res), richError }
    : { ok: false, mode, messageId: null, error: res.error, richError };
}
