/**
 * Funny "thinking" placeholder: posted the moment someone asks Jemaw
 * something, then edited into the real answer so the chat isn't left with
 * leftovers. Every failure path degrades to a plain sendMessage.
 */
import type { Api } from "grammy";

export type LoadingKind = "ledger" | "chat" | "scan";

export const LOADING_LINES: Record<LoadingKind, string[]> = {
  ledger: [
    "🧮 Interrogating the ledger…",
    "📒 Licking my thumb, flipping pages…",
    "🕵️ Following the money…",
    "🔦 Shining a light on who owes what…",
    "🧾 Unrolling the receipts. They're long.",
  ],
  chat: [
    "🤔 Formulating something devastating…",
    "💭 Consulting my inner accountant…",
    "🫖 Brewing a reply. Patience.",
    "✍️ Drafting. Deleting. Drafting again…",
  ],
  scan: [
    "🔍 Rummaging through your last messages…",
    "👀 Reading the chat for money crimes…",
    "🧹 Sweeping the chat for receipts…",
    "📡 Listening for the sound of birr leaving wallets…",
  ],
};

export interface LoadingHandle {
  /** Placeholder message id, or null if it could not be posted. */
  readonly messageId: number | null;
  /** Replace the placeholder with the answer; returns the final message id. */
  finish(text: string, opts?: { parse_mode?: "HTML" }): Promise<number | null>;
  /** Remove the placeholder when there is nothing to say. */
  cancel(): Promise<void>;
}

export async function startLoading(
  api: Api,
  chatId: number,
  opts: { kind: LoadingKind; replyTo?: number; rng?: () => number },
): Promise<LoadingHandle> {
  const lines = LOADING_LINES[opts.kind];
  const line = lines[Math.floor((opts.rng ?? Math.random)() * lines.length)] ?? lines[0]!;
  let messageId: number | null = null;
  try {
    const sent = await api.sendMessage(
      chatId,
      line,
      opts.replyTo != null
        ? { reply_parameters: { message_id: opts.replyTo, allow_sending_without_reply: true } }
        : {},
    );
    messageId = sent.message_id;
  } catch (err) {
    console.warn(`[loading] placeholder failed:`, err instanceof Error ? err.message : err);
  }

  const remove = async () => {
    if (messageId == null) return;
    await api.deleteMessage(chatId, messageId).catch(() => {});
  };

  return {
    messageId,
    async finish(text, sendOpts = {}) {
      if (messageId != null) {
        try {
          await api.editMessageText(chatId, messageId, text, sendOpts);
          return messageId;
        } catch (err) {
          console.warn(`[loading] edit failed, sending fresh:`, err instanceof Error ? err.message : err);
        }
      }
      try {
        const sent = await api.sendMessage(chatId, text, sendOpts);
        await remove();
        return sent.message_id;
      } catch (err) {
        console.warn(`[loading] send failed:`, err instanceof Error ? err.message : err);
        return null;
      }
    },
    cancel: remove,
  };
}
