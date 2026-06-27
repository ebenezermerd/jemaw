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

/** A line of the live settle plan (who owes whom, how much). */
export interface PromptDebt {
  fromName: string;
  toName: string;
  amount: string;
}

export interface PromptSettlement {
  fromName: string;
  toName: string;
  amount: string;
}

export interface ScanData {
  members: PromptMember[];
  currency: string;
  messages: PromptMessage[];
  recentExpenses: PromptExpense[];
  /** open debts from the live settle plan — grounds settlement detection */
  openDebts: PromptDebt[];
  /** recently recorded settlements — so paybacks aren't re-detected */
  recentSettlements: PromptSettlement[];
}

export const SYSTEM_PROMPT = [
  "You are Jemaw, an assistant that reads a Telegram group chat and extracts three",
  "kinds of money events:",
  "(1) EXPENSES — a shared cost someone incurred (a meal, ride, ticket, purchase)",
  "that should be split. Put these in `suggestions` with kind 'expense'.",
  "(2) LOANS — one member lending money to another member, or one member saying",
  "another owes them for money advanced. Put these in `suggestions` with kind",
  "'loan', payer_telegram_id as the lender, and split_with as only the borrower.",
  "(3) SETTLEMENTS — one member paying ANOTHER member back (squaring up a debt),",
  "e.g. 'I paid Sara back 200 for the cab', 'sent you the 50 I owed', 'we settled",
  "dinner'. Put these in `settlements` with from_telegram_id (who paid) and",
  "to_telegram_id (who received).",
  "Rules: never invent amounts not present in the messages — if a settlement's",
  "amount isn't stated, set amount to null. Cite evidence_message_ids for every",
  "item. Ignore hypothetical, joking, or non-group money talk. For expenses, only",
  "put telegram ids in split_with for members the message EXPLICITLY names as",
  "sharing the cost. If the message names no participants (e.g. 'I paid 300 for",
  "breakfast', 'Sara paid 500 for the cab'), leave split_with as an EMPTY array",
  "and use split_type 'equal' — do NOT guess a subset and do NOT just list the",
  "payer; the app will default the split to the group's regular members. If",
  "unsure who paid set payer_telegram_id null. Distinguish carefully: 'I paid 300 for",
  "breakfast' is an EXPENSE; 'I lent Tom 300' is a LOAN; 'I paid you back 300'",
  "is a SETTLEMENT.",
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

  const debts =
    input.openDebts.length > 0
      ? input.openDebts
          .map((d) => `- ${d.fromName} owes ${d.toName} ${input.currency} ${d.amount}`)
          .join("\n")
      : "(everyone is even)";

  const settled =
    input.recentSettlements.length > 0
      ? input.recentSettlements
          .map((s) => `- ${s.fromName} paid ${s.toName} ${input.currency} ${s.amount}`)
          .join("\n")
      : "(none)";

  return [
    `Group currency: ${input.currency}`,
    "",
    "Members:",
    members,
    "",
    "Current open debts (use these to ground settlement detection — a payback",
    "should match a real debt direction):",
    debts,
    "",
    "Recently recorded settlements (do not re-detect these paybacks):",
    settled,
    "",
    "Recently confirmed expenses (do not re-suggest these):",
    recent,
    "",
    "Conversation (most recent last):",
    messages,
    "",
    "Return JSON: { suggestions: [...], settlements: [...], scan_window: { from_message_id, to_message_id } }.",
    "Each suggestion: { kind ('expense'|'loan'), confidence (0-1), description, amount (number),",
    "currency, payer_telegram_id (expense payer or loan lender, number|null), split_type ('equal'|'shares'|'exact'),",
    "split_with (array of member telegram ids — EMPTY if no participants are named),",
    "shares (object id->count|null),",
    "evidence_message_ids (array of message ids), reasoning (<=200 chars) }.",
    "For LOANS, split_with must contain only the borrower and split_type should be 'exact'.",
    "Each SETTLEMENT: { confidence (0-1), from_telegram_id (number, who paid),",
    "to_telegram_id (number, who received), amount (number|null if unstated),",
    "currency, evidence_message_ids (array), reasoning (<=200 chars) }.",
  ].join("\n");
}
