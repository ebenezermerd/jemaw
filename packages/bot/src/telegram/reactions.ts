import type { Api } from "grammy";

/**
 * React with 👀 to each source message the AI used, so the chat shows it noticed
 * and acted. Best-effort per message — a missing/old message or lack of reaction
 * rights never throws.
 */
export async function badgeEvidence(
  api: Api,
  chatId: number,
  messageIds: number[],
): Promise<void> {
  for (const id of messageIds) {
    await api
      .setMessageReaction(chatId, id, [{ type: "emoji", emoji: "👀" }])
      .catch(() => {});
  }
}
