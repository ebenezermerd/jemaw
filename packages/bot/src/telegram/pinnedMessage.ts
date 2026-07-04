/**
 * Pinned-message manager (JEMAW_PLAN.md §4). Keeps a single pinned "Jemaw"
 * message per group whose button opens the Mini App. Button text reflects
 * state ("Open Jemaw", or with a suggestion count later in Phase 3).
 */
import type { Api } from "grammy";
import type { Db } from "../db.js";
import { setPinnedMessageId } from "../repo.js";

export interface PinnedState {
  /** group's internal id */
  groupId: string;
  telegramChatId: bigint;
  existingPinnedMessageId: bigint | null;
  miniAppUrl: string | undefined;
  /** bot username, e.g. "jemawsbot" (for the t.me deep link) */
  botUsername: string | undefined;
  /** Mini App short name from BotFather /newapp (for the t.me deep link) */
  miniAppShortName: string | undefined;
}

export interface EnsurePinnedMessageOptions {
  createIfMissing?: boolean;
}

// Label format per the wireframe K1 spec: "Open Jemaw ↗", or with a middle
// dot counter ("Open Jemaw · 3 suggestions ↗") when suggestions are pending.
function buttonText(suggestionCount: number): string {
  if (suggestionCount <= 0) return "Open Jemaw ↗";
  return `Open Jemaw · ${suggestionCount} suggestion${
    suggestionCount === 1 ? "" : "s"
  } ↗`;
}

/**
 * Build the button that opens the Mini App. Prefers the t.me deep link
 * (t.me/<bot>/<app>?startapp=<groupId>) which opens IN Telegram with the group
 * id as start_param. Falls back to a plain url (browser, no context) only if the
 * deep-link config is missing.
 */
export function buildOpenButton(state: PinnedState, count: number) {
  const label = buttonText(count);
  if (state.botUsername && state.miniAppShortName) {
    const url = `https://t.me/${state.botUsername}/${state.miniAppShortName}?startapp=${state.groupId}`;
    return { text: label, url };
  }
  if (state.miniAppUrl) {
    return { text: label, url: state.miniAppUrl };
  }
  return { text: label, callback_data: "open_jemaw" };
}

/**
 * Ensure the group has a current pinned Jemaw message. Edits the existing one
 * if present, otherwise sends + pins a new one and records its id.
 */
export async function ensurePinnedMessage(
  api: Api,
  db: Db,
  state: PinnedState,
  suggestionCount = 0,
  options: EnsurePinnedMessageOptions = {},
): Promise<void> {
  const text = "<b>Jemaw</b>\nYour group's quiet bookkeeper";
  // `web_app` inline buttons are rejected in GROUPS (BUTTON_TYPE_INVALID). A
  // t.me deep link opens the Mini App in Telegram with group context; see
  // openButton().
  const replyMarkup = { inline_keyboard: [[buildOpenButton(state, suggestionCount)]] };

  const chatId = Number(state.telegramChatId);

  if (state.existingPinnedMessageId !== null) {
    try {
      await api.editMessageText(
        chatId,
        Number(state.existingPinnedMessageId),
        text,
        { reply_markup: replyMarkup, parse_mode: "HTML" },
      );
      return;
    } catch {
      // Existing message gone/uneditable — fall through to send a fresh one.
    }
  }

  if (options.createIfMissing === false) return;

  const sent = await api.sendMessage(chatId, text, {
    reply_markup: replyMarkup,
    parse_mode: "HTML",
  });
  try {
    await api.pinChatMessage(chatId, sent.message_id, {
      disable_notification: true,
    });
  } catch {
    // Pinning may fail without admin rights; the message still works.
  }
  await setPinnedMessageId(db, state.groupId, BigInt(sent.message_id));
}
