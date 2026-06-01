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
}

function buttonText(suggestionCount: number): string {
  if (suggestionCount <= 0) return "Open Jemaw";
  return `Open Jemaw • ${suggestionCount} suggestion${
    suggestionCount === 1 ? "" : "s"
  }`;
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
): Promise<void> {
  const text = "Jemaw — your group's quiet bookkeeper.";
  // NOTE: `web_app` inline buttons are rejected in GROUPS (BUTTON_TYPE_INVALID);
  // they only work in private chats and the menu button. In groups we use a
  // plain `url` button — it opens the Mini App when the URL is a registered
  // Web App (BotFather /newapp or menu button).
  const replyMarkup = state.miniAppUrl
    ? {
        inline_keyboard: [
          [{ text: buttonText(suggestionCount), url: state.miniAppUrl }],
        ],
      }
    : {
        inline_keyboard: [
          [{ text: buttonText(suggestionCount), callback_data: "open_jemaw" }],
        ],
      };

  const chatId = Number(state.telegramChatId);

  if (state.existingPinnedMessageId !== null) {
    try {
      await api.editMessageText(
        chatId,
        Number(state.existingPinnedMessageId),
        text,
        { reply_markup: replyMarkup },
      );
      return;
    } catch {
      // Existing message gone/uneditable — fall through to send a fresh one.
    }
  }

  const sent = await api.sendMessage(chatId, text, {
    reply_markup: replyMarkup,
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
