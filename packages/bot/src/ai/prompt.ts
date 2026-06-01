/**
 * Prompt construction for the Gemini scan (JEMAW_PLAN.md §6). Sends only
 * display names + message text — NO usernames, phone numbers, or Telegram ids
 * in prose (the model gets numeric telegram ids only to reference payers/splits
 * in its JSON output, per the schema).
 */

export interface PromptMember {
  telegramUserId: number;
  displayName: string;
}

export interface PromptMessage {
  telegramMessageId: number;
  senderName: string;
  text: string;
  sentAt: Date;
}

export interface PromptExpense {
  description: string;
  amount: string; // decimal
  payerName: string;
}

export interface ScanData {
  members: PromptMember[];
  currency: string;
  messages: PromptMessage[];
  recentExpenses: PromptExpense[];
}

export const SYSTEM_PROMPT = [
  "You are Jemaw, an assistant that extracts expense events from a Telegram",
  "group chat. Members share meals, rides, tickets, and small purchases. From",
  "the messages provided, identify only the expenses that clearly happened, who",
  "paid, and who shares the cost. You must never invent amounts not present in",
  "the messages. Cite the message ids that justify each suggestion. If a message",
  "mentions money but is hypothetical, joking, or not a group expense, ignore",
  "it. If the split is unclear, default to equal among all members present in",
  "the conversation. If you are unsure who paid, set payer_telegram_id to null.",
  "Output strict JSON matching the schema. No prose outside the JSON.",
].join(" ");

export function buildUserPrompt(input: ScanData): string {
  const members = input.members
    .map((m) => `- ${m.displayName} (id ${m.telegramUserId})`)
    .join("\n");

  const recent =
    input.recentExpenses.length > 0
      ? input.recentExpenses
          .map(
            (e) =>
              `- ${e.description}: ${input.currency} ${e.amount} paid by ${e.payerName}`,
          )
          .join("\n")
      : "(none)";

  const messages = input.messages
    .map(
      (m) =>
        `[msg ${m.telegramMessageId}] ${m.senderName} (${m.sentAt
          .toISOString()
          .slice(11, 16)}): ${m.text}`,
    )
    .join("\n");

  return [
    `Group currency: ${input.currency}`,
    "",
    "Members:",
    members,
    "",
    "Recently confirmed expenses (do not re-suggest these):",
    recent,
    "",
    "Conversation (most recent last):",
    messages,
    "",
    "Return JSON: { suggestions: [...], scan_window: { from_message_id, to_message_id } }.",
    "Each suggestion: { confidence (0-1), description, amount (number), currency,",
    "payer_telegram_id (number|null), split_type ('equal'|'shares'|'exact'),",
    "split_with (array of member telegram ids), shares (object id->count|null),",
    "evidence_message_ids (array of message ids), reasoning (<=200 chars) }.",
  ].join("\n");
}
