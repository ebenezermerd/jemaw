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

  if (/https?:\/\//i.test(trimmed) || /api[_-]?key/i.test(trimmed)) {
    return { ok: false, reason: "unsafe_content" };
  }

  const allowedNums = new Set<string>();
  const pf = packet.public_facts;
  for (const key of [
    "suggestion_count",
    "new_written",
    "pending_count",
    "settlement_count",
  ] as const) {
    const v = pf[key];
    if (v != null) allowedNums.add(String(v));
  }
  const found = trimmed.match(/\d+(?:\.\d+)?/g) ?? [];
  for (const n of found) {
    if (!allowedNums.has(n)) {
      return { ok: false, reason: `unapproved_number:${n}` };
    }
  }

  // Block names that look like capitalized tokens unless allowed
  if (packet.allowed_target_names.length === 0) {
    // soft: no check for all capitals short words
  } else {
    // If text contains a Title Case word of length>=3 that isn't allowed and isn't common
    const allowed = new Set(
      packet.allowed_target_names.map((n) => n.toLowerCase()),
    );
    const stop = new Set([
      "the",
      "and",
      "jemaw",
      "open",
      "draft",
      "drafts",
      "expense",
      "expenses",
      "still",
      "waiting",
      "review",
      "ledger",
      "books",
      "scan",
      "found",
      "nothing",
      "clear",
    ]);
    const tokens = trimmed.match(/\b[A-Z][a-z]{2,}\b/g) ?? [];
    for (const t of tokens) {
      const low = t.toLowerCase();
      if (stop.has(low)) continue;
      if (!allowed.has(low)) {
        // labels may appear from draft_labels
        const labelHit = (packet.public_facts.draft_labels ?? []).some((l) =>
          l.toLowerCase().includes(low),
        );
        if (!labelHit) {
          return { ok: false, reason: `unapproved_name:${t}` };
        }
      }
    }
  }

  if (/\{\{/.test(trimmed)) return { ok: false, reason: "unrendered_placeholder" };

  return { ok: true };
}

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
