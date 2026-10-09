/**
 * Decide whether a message that contains "jemaw" wants a scan of the chat,
 * an answer from the ledger, or a short social / companion reply.
 *
 * /jemaw and bare "jemaw" stay scan, as do explicit scan requests and money
 * statements ("I paid 300 for lunch"). Questions about the books ("how much do
 * I owe?") read the ledger. Greetings and banter use DB-grounded chat.
 */

export type JemawIntent = "scan" | "chat" | "ledger" | "correction";

export type LedgerQuestionKind =
  | "whoami"
  | "leaderboard"
  | "my_balance"
  | "who_owes"
  | "expense_list"
  | "totals"
  | "pending"
  | "overview";

export type LedgerPeriod = "week" | "month" | "all";

/** A ledger question, fully resolved: what to answer, for whom, over what span. */
export interface LedgerQuery {
  kind: LedgerQuestionKind;
  period: LedgerPeriod;
  /** Last N days; overrides period when set. */
  days?: number;
  /** At most N rows. */
  limit?: number;
  /** Only the asker's expenses: ones they paid, or ones they paid or shared. */
  mine?: "paid" | "involved";
  /** The member the question names, as their display name; narrows open payments to them. */
  person?: string;
}

/** Owe words, forgiving the common "own" typo. */
const OWE_RE = /\b(owe|owes|owed|owing|own|owned|debts?|balances?|payments?|paybacks?|settle|settles|settled|settlements?|unsettled|unpaid|outstanding|due|hasn'?t\s+paid|not\s+paid|(?:has|have|needs?)\s+to\s+pay)\b/i;
/** Drafts are expenses the app found but nobody confirmed yet; "pending payments" are debts, not drafts. */
const DRAFT_RE = /\b(drafts?|unconfirmed|review|suggestions?)\b/i;
/** The asker means themselves; "show me" and "tell me" don't count. */
export function isAboutMe(text: string): boolean {
  return /\b(i|me|my|mine|i'?m|i'?ve|myself)\b/i.test(text.replace(/\b(show|tell|give|let|send)\s+me\b/gi, ""));
}
const WHOAMI_RE = /\bwho\s+am\s+i\b/i;
/** Who is rich, broke, cheap: a ranking read from spending, not real wealth. */
const LEADERBOARD_RE =
  /\b(rich|richest|baller|broke|brokest|poor|cheap|cheapest|stingy|generous|freeloader|sugar\s*daddy|(biggest|big|top)\s+spender|who\s+pays?\s+(the\s+)?most|who\s+owes\s+(the\s+)?most|leaderboard|ranking)\b/i;
const COMPLAINT_RE =
  /\b(wrong|mixed|incorrect|mistake|confus\w*|not\s+what|i\s+said|i\s+asked|what\s+did\s+i\s+say|what\s+did\s+i\s+said|you\s+crazy|are\s+you\s+crazy|that'?s\s+not)\b/i;

const EXPLICIT_SCAN_RE =
  /\b(scan|check|refresh|update|find|search|catch\s*up|look\s*(into|for)|any\s+new\s+(expenses?|drafts?)|any\s+(expenses?|drafts?))\b/i;

const LEDGER_TOPIC_RE =
  /\b(rich|richest|baller|broke|poor|cheap|cheapest|stingy|generous|freeloader|spender|leaderboard|owe|owes|owed|owing|own|owned|payments?|unsettled|unpaid|outstanding|settlements?|latest|recent|balances?|debts?|pending|drafts?|waiting|expenses?|spent|spend|spending|total|totals|stats|summary|ledger|books?|settle|paid|history|list|biggest|most)\b/i;

const QUESTION_START_RE =
  /^(are|is|am|do|does|did|can|could|will|what|what'?s|why|when|who|whom|whose|where|how|which|list|show|tell|give|summari[sz]e|any)\b/i;

const REQUEST_RE = /\b(tell\s+me|show\s+me|give\s+me|list|let\s+me\s+see)\b/i;

const SCAN_RE =
  /\b(scan|check|refresh|update|find|search|catch\s*up|look\s*(into|at|for)|any\s+(new\s+)?expenses?|any\s+(new\s+)?drafts?|pending|ledger|books?|settle|balance|what\s+did\s+we|we\s+(spent|paid|bought)|expenses?|drafts?)\b/i;

const MONEY_RE =
  /\b(spent|paid|owe|owes|owing|birr|etb|usd|\$|split|bill|bought|cost|transfer|deposit)\b/i;

const SOCIAL_RE =
  /\b(hey|hi|hello|yo|sup|hii+|heya|what'?s\s*up|wassup|how\s*are|how'?s\s*it|how\s*you|cooking|doing|miss\s*you|love\s*you|bored|joke|funny|roast\s*me|tell\s*me|you\s+good|u\s+good|wyd|what\s*are\s*you|are\s*you\s*(there|alive|ok|around)|missed\s*you|good\s*(morning|night|evening)|gn|gm)\b/i;

/**
 * "jemaw" as a word, or the bot's @username ("@jemawsbot"), so tagging the
 * bot works the same as calling it by name.
 */
const JEMAW_MENTION = String.raw`(?<![a-z0-9_])@?jemaw(?:[a-z0-9_]*bot)?(?![a-z0-9_])`;
export const JEMAW_MENTION_RE = new RegExp(JEMAW_MENTION, "i");

/** Whether a message addresses Jemaw, by name or by @username. */
export function mentionsJemaw(text: string, botUsername?: string): boolean {
  if (JEMAW_MENTION_RE.test(text)) return true;
  if (!botUsername) return false;
  const at = `@${botUsername.replace(/^@/, "").toLowerCase()}`;
  return text.toLowerCase().split(/[^a-z0-9_@]+/).includes(at);
}

/** Strip the jemaw token so we classify the rest of the utterance. */
export function stripJemawToken(text: string): string {
  return text
    .replace(new RegExp(JEMAW_MENTION, "gi"), " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function classifyJemawIntent(
  text: string,
  opts: { hasPrevious?: boolean } = {},
): JemawIntent {
  const raw = text.trim();
  const without = stripJemawToken(raw);

  // Bare "jemaw" / "jemaw!" → classic scan trigger.
  if (!without || without.replace(/[!?.,…]+/g, "").trim().length === 0) {
    return "scan";
  }

  // "That's wrong / I said what I paid" right after an answer → redo it.
  if (opts.hasPrevious && COMPLAINT_RE.test(without)) return "correction";
  if (WHOAMI_RE.test(without)) return "ledger";

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
  if (WHOAMI_RE.test(t)) return "whoami";
  if (LEADERBOARD_RE.test(t)) return "leaderboard";
  if (DRAFT_RE.test(t)) return "pending";
  // Pending, waiting or unsettled money means open payments: everyone's unless they ask about their own.
  if (OWE_RE.test(t) || /\b(pending|waiting)\b/.test(t)) return isAboutMe(t) ? "my_balance" : "who_owes";
  if (/\b(total|totals|how\s+much|stats|most|biggest|top)\b/.test(t)) return "totals";
  if (/\b(list|latest|recent|history|expenses?|purchases?|spent\s+on|bought|paid|pay|pays)\b/.test(t)) {
    return "expense_list";
  }
  return "overview";
}

/** Full query from a question: kind, period, day window, count and "mine". */
export function parseLedgerQuery(text: string): LedgerQuery {
  const t = stripJemawToken(text).toLowerCase();
  const kind = classifyLedgerQuestion(text);
  const q: LedgerQuery = { kind, period: ledgerPeriod(t) };
  const days = /\b(\d{1,3})\s*days?\b/.exec(t);
  if (days) q.days = Number(days[1]);
  else if (/\btoday\b/.test(t)) q.days = 1;
  if (!days) {
    const limit =
      /\b(?:latest|last|recent|top|first)\s+(\d{1,3})\b/.exec(t) ??
      /\b(\d{1,3})\s+(?:of\s+them|expenses?|items?|entries)\b/.exec(t);
    if (limit) q.limit = Number(limit[1]);
  }
  if (kind === "expense_list" || kind === "totals") {
    if (/\b(my\s+share|i\s+was\s+(in|part)|included|involved)\b/.test(t)) q.mine = "involved";
    else if (/\b(my|mine|i\s+(paid|spent|spend|bought)|did\s+i\s+(pay|spend))\b/.test(t)) q.mine = "paid";
  }
  return q;
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
