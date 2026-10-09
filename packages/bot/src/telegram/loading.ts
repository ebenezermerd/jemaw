/**
 * Funny "thinking" placeholder, in the spirit of a CLI spinner: the first line
 * fits what was asked, then while Jemaw is still working the same message
 * cycles through spirit lines until it is edited into the real answer. Every
 * failure path degrades to a plain sendMessage.
 */
import type { Api } from "grammy";
import type { LedgerQuestionKind } from "../ai/humor/intent.js";

export type LoadingTopic = LedgerQuestionKind | "greeting" | "checkin" | "chat" | "scan";

/** First frame: matches what was asked. */
export const OPENERS: Record<LoadingTopic, string[]> = {
  leaderboard: [
    "💎 Weighing everyone's gold…",
    "👑 Measuring wallets…",
    "🏆 Polishing the trophy for the richest…",
    "🔍 Checking under couches for loose birr…",
  ],
  whoami: [
    "🪪 Checking your ID…",
    "🪞 Holding up a mirror…",
    "📇 Pulling your file from the cabinet…",
  ],
  my_balance: [
    "🧾 Checking how deep in debt you are…",
    "🔎 Looking you up in the book of debts…",
    "🧮 Adding up your sins…",
    "📒 Finding your page. It's a long page…",
  ],
  who_owes: [
    "🕵️ Following the money…",
    "📜 Unrolling the list of the guilty…",
    "🔦 Shining a light on who owes what…",
    "⚖️ Weighing everyone's debts…",
  ],
  expense_list: [
    "🧾 Unrolling the receipts. They're long…",
    "📚 Pulling the expense scrolls off the shelf…",
    "🛒 Retracing every purchase…",
    "🗂️ Flipping through the spending history…",
  ],
  totals: [
    "🧮 Crunching the big numbers…",
    "📈 Measuring how much damage was done…",
    "🏆 Finding out who's been splurging…",
    "💸 Counting every birr that left a wallet…",
  ],
  pending: [
    "⏳ Checking the drafts gathering dust…",
    "📥 Peeking into the review pile…",
    "🗃️ Counting the unconfirmed drafts…",
  ],
  overview: [
    "🗺️ Drawing the map of the group's money…",
    "📊 Summoning the whole ledger…",
    "🔭 Surveying the books from above…",
  ],
  greeting: [
    "👋 Fixing my ghostly hair…",
    "🫡 Straightening my ledger tie…",
    "👻 Floating over to say hi…",
    "☕ Putting the kettle on…",
  ],
  checkin: [
    "🩺 Taking my own temperature…",
    "🤒 Checking if ghosts can get sick…",
    "💭 Asking myself how I'm doing…",
  ],
  chat: [
    "🤔 Formulating something devastating…",
    "💭 Consulting my inner accountant…",
    "✍️ Drafting. Deleting. Drafting again…",
    "🫖 Brewing a reply…",
  ],
  scan: [
    "🔍 Rummaging through your last messages…",
    "👀 Reading the chat for money crimes…",
    "🧹 Sweeping the chat for receipts…",
    "📡 Listening for birr leaving wallets…",
  ],
};

/** Later frames: the spinner, pure Jemaw spirit. */
export const SPIRIT_LINES: string[] = [
  "👻 Haunting the ledger…",
  "🧾 Rattling receipts…",
  "🪙 Bribing the calculator…",
  "🧮 Sliding abacus beads…",
  "📒 Licking my thumb, flipping pages…",
  "🕯️ Lighting a candle over the books…",
  "🔮 Consulting the crystal spreadsheet…",
  "🌀 Jemawing…",
  "🫖 Steeping the numbers…",
  "🪶 Dipping my quill…",
  "🧹 Dusting off old IOUs…",
  "🔢 Counting on ghostly fingers…",
  "🎲 Definitely not guessing…",
  "📎 Paperclipping the debts together…",
  "🧠 Remembering who paid for pizza…",
  "🕵️ Interrogating the decimals…",
  "🪄 Summoning the spirits of spent birr…",
  "🧂 Taking your excuses with a grain of salt…",
  "🗝️ Unlocking the vault of shame…",
  "📯 Calling the ancestors of accounting…",
  "🧊 Cooling down an overheated wallet…",
  "🐌 Moving at ledger speed…",
  "🛎️ Ringing the receipt bell…",
  "🌙 Whispering to the books at midnight…",
  "🎻 Playing sad violin for your balance…",
  "🧵 Untangling who owes whom…",
  "🍕 Splitting an imaginary pizza…",
  "🪞 Asking the mirror who spent the most…",
  "🦉 Consulting the wise ledger owl…",
  "📦 Unboxing forgotten expenses…",
  "🧯 Putting out a budget fire…",
  "🛸 Beaming up the numbers…",
  "🥁 Drumroll for the totals…",
  "🧘 Achieving financial inner peace…",
  "🫣 Peeking at everyone's wallets…",
  "⚗️ Distilling pure accountability…",
];

export const FRAME_MS = 1300;
/** Cap spinner edits so a slow answer never floods the chat's edit limit. */
export const MAX_FRAMES = 5;

const lastOpenerByChat = new Map<number, string>();

export interface LoadingHandle {
  /** Placeholder message id, or null if it could not be posted. */
  readonly messageId: number | null;
  /** Replace the placeholder with the answer; returns the final message id. */
  finish(
    text: string,
    opts?: {
      parse_mode?: "HTML";
      reply_markup?: {
        inline_keyboard: ({ text: string; style?: "primary" | "success" | "danger" } & ({ url: string } | { callback_data: string }))[][];
      };
    },
  ): Promise<number | null>;
  /**
   * Stop the spinner and hand the placeholder to `send`, which may edit it
   * or post a new message. A placeholder that wasn't reused is removed.
   */
  finishWith(send: (placeholderId: number | null) => Promise<number | null>): Promise<number | null>;
  /** Remove the placeholder when there is nothing to say. */
  cancel(): Promise<void>;
}

function pickFresh(lines: string[], avoid: Set<string>, rng: () => number): string {
  const pool = lines.filter((l) => !avoid.has(l));
  const from = pool.length ? pool : lines;
  return from[Math.floor(rng() * from.length)] ?? from[0]!;
}

export async function startLoading(
  api: Api,
  chatId: number,
  opts: { topic: LoadingTopic; replyTo?: number; rng?: () => number },
): Promise<LoadingHandle> {
  const rng = opts.rng ?? Math.random;
  const last = lastOpenerByChat.get(chatId);
  const opener = pickFresh(OPENERS[opts.topic], new Set(last ? [last] : []), rng);
  lastOpenerByChat.set(chatId, opener);

  let messageId: number | null = null;
  try {
    const sent = await api.sendMessage(
      chatId,
      opener,
      opts.replyTo != null
        ? { reply_parameters: { message_id: opts.replyTo, allow_sending_without_reply: true } }
        : {},
    );
    messageId = sent.message_id;
  } catch (err) {
    console.warn(`[loading] placeholder failed:`, err instanceof Error ? err.message : err);
  }

  // Spinner: edits are chained so the final answer always lands last.
  let done = false;
  let queue: Promise<unknown> = Promise.resolve();
  let timer: ReturnType<typeof setInterval> | undefined;
  if (messageId != null) {
    const shown = new Set<string>();
    let frames = 0;
    timer = setInterval(() => {
      if (done || frames >= MAX_FRAMES) {
        clearInterval(timer);
        return;
      }
      frames++;
      const line = pickFresh(SPIRIT_LINES, shown, Math.random);
      shown.add(line);
      queue = queue.then(() =>
        done ? undefined : api.editMessageText(chatId, messageId!, line).catch(() => {}),
      );
    }, FRAME_MS);
    timer.unref?.();
  }

  const stop = async () => {
    done = true;
    if (timer) clearInterval(timer);
    await queue;
  };

  const remove = async () => {
    if (messageId == null) return;
    await api.deleteMessage(chatId, messageId).catch(() => {});
  };

  return {
    messageId,
    async finish(text, sendOpts = {}) {
      await stop();
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
    async finishWith(send) {
      await stop();
      const id = await send(messageId);
      if (id != null && id !== messageId) await remove();
      return id;
    },
    async cancel() {
      await stop();
      await remove();
    },
  };
}
