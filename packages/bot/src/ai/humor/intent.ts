/**
 * Decide whether a message that contains "jemaw" wants a scan of the chat,
 * an answer from the ledger, or a short social / companion reply.
 *
 * /jemaw and bare "jemaw" stay scan, as do explicit scan requests and money
 * statements ("I paid 300 for lunch"). Questions about the books ("how much do
 * I owe?") read the ledger. Greetings and banter use DB-grounded chat.
 */

export type JemawIntent = "scan" | "chat" | "ledger";

export type LedgerQuestionKind =
  | "my_balance"
  | "who_owes"
  | "expense_list"
  | "totals"
  | "pending"
  | "overview";

export type LedgerPeriod = "week" | "month" | "all";

const EXPLICIT_SCAN_RE =
  /\b(scan|check|refresh|update|find|search|catch\s*up|look\s*(into|for)|any\s+new\s+(expenses?|drafts?)|any\s+(expenses?|drafts?))\b/i;

const LEDGER_TOPIC_RE =
  /\b(owe|owes|owed|owing|balances?|debts?|pending|drafts?|waiting|expenses?|spent|spend|spending|total|totals|stats|summary|ledger|books?|settle|paid|history|list|biggest|most)\b/i;

const QUESTION_START_RE =
  /^(are|is|am|do|does|did|can|could|will|what|what'?s|why|when|who|whom|whose|where|how|which|list|show|tell|give|summari[sz]e|any)\b/i;

const REQUEST_RE = /\b(tell\s+me|show\s+me|give\s+me|list|let\s+me\s+see)\b/i;

const SCAN_RE =
  /\b(scan|check|refresh|update|find|search|catch\s*up|look\s*(into|at|for)|any\s+(new\s+)?expenses?|any\s+(new\s+)?drafts?|pending|ledger|books?|settle|balance|what\s+did\s+we|we\s+(spent|paid|bought)|expenses?|drafts?)\b/i;

const MONEY_RE =
  /\b(spent|paid|owe|owes|owing|birr|etb|usd|\$|split|bill|bought|cost|transfer|deposit)\b/i;

const SOCIAL_RE =
  /\b(hey|hi|hello|yo|sup|hii+|heya|what'?s\s*up|wassup|how\s*are|how'?s\s*it|how\s*you|cooking|doing|miss\s*you|love\s*you|bored|joke|funny|roast\s*me|tell\s*me|you\s+good|u\s+good|wyd|what\s*are\s*you|are\s*you\s*(there|alive|ok|around)|missed\s*you|good\s*(morning|night|evening)|gn|gm)\b/i;

/** Strip the jemaw token so we classify the rest of the utterance. */
export function stripJemawToken(text: string): string {
  return text
    .replace(/(?<![a-z0-9])jemaw(?![a-z0-9])/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function classifyJemawIntent(text: string): JemawIntent {
  const raw = text.trim();
  const without = stripJemawToken(raw);

  // Bare "jemaw" / "jemaw!" → classic scan trigger.
  if (!without || without.replace(/[!?.,…]+/g, "").trim().length === 0) {
    return "scan";
  }

  if (EXPLICIT_SCAN_RE.test(without)) return "scan";

  const asking =
    /\?/.test(raw) || QUESTION_START_RE.test(without) || REQUEST_RE.test(without);
  if (asking && LEDGER_TOPIC_RE.test(without)) return "ledger";

  if (SCAN_RE.test(without) || MONEY_RE.test(without)) {
    return "scan";
  }

  if (SOCIAL_RE.test(without)) {
    return "chat";
  }

  // Direct question / short banter → chat.
  if (/\?/.test(raw)) return "chat";
  if (/^(are|is|do|did|can|will|what|why|when|who|where|how|you)\b/i.test(without)) {
    return "chat";
  }

  // Short address without ledger language → chat (e.g. "jemaw 👀").
  const words = without.split(/\s+/).filter(Boolean);
  if (words.length <= 10) return "chat";

  // Longer free text that tagged jemaw → treat as scan (expense context).
  return "scan";
}

/** Which flavour of loading line fits a chat message. */
export function chatLoadingTopic(text: string): "greeting" | "checkin" | "chat" {
  const t = stripJemawToken(text).toLowerCase();
  if (/\b(sick|ill|ok|okay|alright|alive|good|fine|tired|how\s+are\s+you|how\s+you\s+doing|you\s+there)\b/.test(t)) {
    return "checkin";
  }
  if (/^(hey|hi|hello|yo|sup|hii+|heya|gm|gn|good\s+(morning|night|evening)|what'?s\s*up|wassup)\b/.test(t)) {
    return "greeting";
  }
  return "chat";
}

/** Which ledger answer a question wants. Order matters: most specific first. */
export function classifyLedgerQuestion(text: string): LedgerQuestionKind {
  const t = stripJemawToken(text).toLowerCase();
  if (/\b(pending|drafts?|waiting|unconfirmed|review)\b/.test(t)) return "pending";
  const aboutMe = /\b(i|me|my|mine)\b/.test(t);
  if (aboutMe && /\b(owe|owes|owed|owing|balance|debts?|pay|paid)\b/.test(t)) {
    return "my_balance";
  }
  if (/\b(owe|owes|owed|owing|debts?|hasn'?t\s+paid|not\s+paid|unpaid|settle|balances?)\b/.test(t)) {
    return "who_owes";
  }
  if (/\b(total|totals|how\s+much|stats|most|biggest|top)\b/.test(t)) return "totals";
  if (/\b(list|history|expenses?|recent|spent\s+on|bought)\b/.test(t)) return "expense_list";
  return "overview";
}

export function ledgerPeriod(text: string): LedgerPeriod {
  if (/\b(week|weekly|7\s*days)\b/i.test(text)) return "week";
  if (/\b(month|monthly)\b/i.test(text)) return "month";
  return "all";
}

/** Safe snippet of what the user said, for the model (no secrets, bounded). */
export function sanitizeAddressedUtterance(text: string, maxLen = 160): string {
  return text
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLen)
    .replace(/https?:\/\/\S+/gi, "")
    .trim();
}
