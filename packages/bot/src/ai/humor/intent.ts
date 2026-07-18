/**
 * Decide whether a message that contains "jemaw" wants a ledger scan
 * or a short social / companion reply.
 *
 * /jemaw and bare "jemaw" stay scan. Greetings and banter skip the expensive
 * extract pass and use DB-grounded chat instead.
 */

export type JemawIntent = "scan" | "chat";

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

/** Safe snippet of what the user said, for the model (no secrets, bounded). */
export function sanitizeAddressedUtterance(text: string, maxLen = 160): string {
  return text
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLen)
    .replace(/https?:\/\/\S+/gi, "")
    .trim();
}
