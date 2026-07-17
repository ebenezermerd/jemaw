/**
 * Fact-lock verifier: reject candidates that invent numbers, names, or lengths.
 */
import type { PublicSafeFactPacket } from "@jemaw/shared/humor";

const MAX_WORDS = 22;

export function verifyCandidate(
  text: string,
  packet: PublicSafeFactPacket,
): { ok: true } | { ok: false; reason: string } {
  const trimmed = text.trim();
  if (!trimmed) return { ok: false, reason: "empty" };
  if (trimmed.length > 280) return { ok: false, reason: "too_long" };
  const words = trimmed.split(/\s+/).filter(Boolean);
  if (words.length > MAX_WORDS) return { ok: false, reason: "too_many_words" };

  // Reject URLs and secret-looking strings.
  if (/https?:\/\//i.test(trimmed) || /api[_-]?key/i.test(trimmed)) {
    return { ok: false, reason: "unsafe_content" };
  }

  // Any number in the text must appear in the allowed fact values.
  const allowedNums = new Set<string>();
  if (packet.public_facts.suggestion_count != null) {
    allowedNums.add(String(packet.public_facts.suggestion_count));
  }
  if (packet.public_facts.settlement_count != null) {
    allowedNums.add(String(packet.public_facts.settlement_count));
  }
  const found = trimmed.match(/\d+(?:\.\d+)?/g) ?? [];
  for (const n of found) {
    if (!allowedNums.has(n)) {
      return { ok: false, reason: `unapproved_number:${n}` };
    }
  }

  // Leftover placeholders mean render failed.
  if (/\{\{/.test(trimmed)) return { ok: false, reason: "unrendered_placeholder" };

  return { ok: true };
}

/** Simple token overlap repetition check against recent reply texts. */
export function isTooSimilar(candidate: string, recent: string[]): boolean {
  const a = normalizeTokens(candidate);
  if (a.size === 0) return false;
  for (const r of recent) {
    const b = normalizeTokens(r);
    if (b.size === 0) continue;
    let inter = 0;
    for (const t of a) if (b.has(t)) inter++;
    const union = a.size + b.size - inter;
    const jaccard = union === 0 ? 0 : inter / union;
    if (jaccard >= 0.72) return true;
  }
  return false;
}

function normalizeTokens(s: string): Set<string> {
  return new Set(
    s
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, " ")
      .split(/\s+/)
      .filter((w) => w.length > 2),
  );
}
