/**
 * Send a composed post: as a Rich Message when the design asks for one, with
 * generated images uploaded inline, and as the classic HTML message when the
 * layout is classic or Telegram refuses the rich version.
 */
import { InputFile, type Api } from "grammy";
import type { ComposedPost, ImageSpec, RichBlock } from "@jemaw/shared/posts";

export type ImageRenderer = (spec: ImageSpec) => Promise<Buffer>;

export interface SendPostOptions {
  /** Defaults to the shared satori renderer, loaded on first use. */
  renderImage?: ImageRenderer;
  replyTo?: number;
  /**
   * A message to turn into this post (the loading placeholder). Only text
   * posts are edited in place; anything with images is sent fresh.
   */
  editMessageId?: number | null;
}

export interface SentPost {
  messageId: number | null;
  /** How it went out: rich, classic by design, or classic after rich failed. */
  mode: "rich" | "classic" | "fallback";
}

let defaultRenderer: ImageRenderer | null = null;
async function loadRenderer(): Promise<ImageRenderer> {
  defaultRenderer ??= (await import("@jemaw/shared/postImages")).renderPostImage;
  return defaultRenderer;
}

const IMAGE_REF = /^image:(\d+)$/;

/** Swap "image:<n>" references for uploads. */
function withFiles(blocks: RichBlock[], files: InputFile[]): unknown[] {
  const swap = (value: unknown): unknown => {
    if (Array.isArray(value)) return value.map(swap);
    if (value && typeof value === "object") {
      return Object.fromEntries(
        Object.entries(value).map(([k, v]) => {
          const m = k === "media" && typeof v === "string" ? IMAGE_REF.exec(v) : null;
          return [k, m ? files[Number(m[1])] : swap(v)];
        }),
      );
    }
    return value;
  };
  return blocks.map(swap);
}

type Raw = Record<string, (payload: Record<string, unknown>) => Promise<{ message_id?: number } | true>>;

export async function sendPost(
  api: Api,
  chatId: number,
  post: ComposedPost,
  opts: SendPostOptions = {},
): Promise<SentPost> {
  const raw = api.raw as unknown as Raw;
  const keyboard = post.keyboard.length ? { inline_keyboard: post.keyboard } : undefined;
  const reply = opts.replyTo != null
    ? { reply_parameters: { message_id: opts.replyTo, allow_sending_without_reply: true } }
    : {};

  if (post.rich) {
    try {
      const render = opts.renderImage ?? (await loadRenderer());
      const files = await Promise.all(
        post.images.map(async (spec, i) => new InputFile(await render(spec), `jemaw-${i}.png`)),
      );
      const rich_message = { blocks: withFiles(post.rich, files) };
      // Callback buttons can't live inside the message, so they always go below.
      const actionRows = post.keyboard.filter((row) => row.some((b) => b.callback_data));
      const reply_markup =
        post.buttonsPlacement === "below" ? keyboard : actionRows.length ? { inline_keyboard: actionRows } : undefined;
      if (opts.editMessageId != null && files.length === 0) {
        try {
          await raw.editMessageText!({ chat_id: chatId, message_id: opts.editMessageId, rich_message, reply_markup });
          return { messageId: opts.editMessageId, mode: "rich" };
        } catch (err) {
          console.warn(`[post] rich edit failed, sending fresh:`, err instanceof Error ? err.message : err);
        }
      }
      const sent = await raw.sendRichMessage!({ chat_id: chatId, rich_message, reply_markup, ...reply });
      return { messageId: (sent as { message_id: number }).message_id, mode: "rich" };
    } catch (err) {
      console.warn(`[post] rich ${post.useCase} failed, sending classic:`, err instanceof Error ? err.message : err);
    }
  }

  const mode = post.rich ? "fallback" : "classic";
  const html = { parse_mode: "HTML" as const, reply_markup: keyboard as never, ...reply };
  if (post.photo && post.html.length <= 1024) {
    try {
      const render = opts.renderImage ?? (await loadRenderer());
      const sent = await api.sendPhoto(chatId, new InputFile(await render(post.photo), "jemaw.png"), { caption: post.html, ...html });
      return { messageId: sent.message_id, mode };
    } catch (err) {
      console.warn(`[post] photo failed, sending text:`, err instanceof Error ? err.message : err);
    }
  }
  if (opts.editMessageId != null) {
    try {
      await api.editMessageText(chatId, opts.editMessageId, post.html, {
        parse_mode: "HTML",
        reply_markup: keyboard as never,
        link_preview_options: { is_disabled: true },
      });
      return { messageId: opts.editMessageId, mode };
    } catch {
      // fall through to a fresh message
    }
  }
  const sent = await api.sendMessage(chatId, post.html, { ...html, link_preview_options: { is_disabled: true } });
  return { messageId: sent.message_id, mode };
}
