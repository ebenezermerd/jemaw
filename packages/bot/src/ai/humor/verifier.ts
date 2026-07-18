/**
 * Fact-lock verifier: reject candidates that invent numbers, names, or lengths.
 * Numbers must appear in allowed_number_tokens or public_facts counts/amounts.
 */
import type { PublicSafeFactPacket } from "@jemaw/shared/humor";

/** Grounded companion replies stay chat-length, not essays. */
const MAX_WORDS = 42;

export function verifyCandidate(
  text: string,
  packet: PublicSafeFactPacket,
): { ok: true } | { ok: false; reason: string } {
  const trimmed = text.trim();
  if (!trimmed) return { ok: false, reason: "empty" };
  if (trimmed.length > 400) return { ok: false, reason: "too_long" };
  const words = trimmed.split(/\s+/).filter(Boolean);
  if (words.length > MAX_WORDS) return { ok: false, reason: "too_many_words" };

  if (/https?:\/\//i.test(trimmed) || /api[_-]?key/i.test(trimmed)) {
    return { ok: false, reason: "unsafe_content" };
  }

  const allowedNums = collectAllowedNumbers(packet);
  const found = trimmed.match(/\d+(?:\.\d+)?/g) ?? [];
  for (const n of found) {
    if (!allowedNums.has(n) && !allowedNums.has(stripTrailingZeros(n))) {
      return { ok: false, reason: `unapproved_number:${n}` };
    }
  }

  // Block Title-Case names unless allowed or present in draft labels
  if (packet.allowed_target_names.length >= 0) {
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
      "lunch",
      "dinner",
      "breakfast",
      "app",
      "mini",
      "total",
      "pending",
      "someone",
      "anyone",
      "today",
      "again",
    ]);
    const labelBlob = [
      ...(packet.public_facts.draft_labels ?? []),
      ...(packet.public_facts.drafts ?? []).map((d) => d.label),
    ]
      .join(" ")
      .toLowerCase();

    const tokens = trimmed.match(/\b[A-Z][a-z]{2,}\b/g) ?? [];
    for (const t of tokens) {
      const low = t.toLowerCase();
      if (stop.has(low)) continue;
      if (allowed.has(low)) continue;
      // multi-word allowed names
      if (
        packet.allowed_target_names.some((n) =>
          n.toLowerCase().split(/\s+/).includes(low),
        )
      ) {
        continue;
      }
      if (labelBlob.includes(low)) continue;
      return { ok: false, reason: `unapproved_name:${t}` };
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

function collectAllowedNumbers(packet: PublicSafeFactPacket): Set<string> {
  const set = new Set<string>();
  const add = (v: string | number | undefined | null) => {
    if (v == null || v === "") return;
    const s = String(v).trim();
    if (!s) return;
    set.add(s);
    set.add(stripTrailingZeros(s));
    const n = Number(s);
    if (Number.isFinite(n)) {
      set.add(String(n));
      if (Number.isInteger(n)) set.add(String(Math.trunc(n)));
    }
  };

  for (const t of packet.allowed_number_tokens ?? []) add(t);

  const pf = packet.public_facts;
  for (const key of [
    "suggestion_count",
    "new_written",
    "pending_count",
    "settlement_count",
    "active_member_count",
  ] as const) {
    add(pf[key]);
  }
  for (const d of pf.drafts ?? []) add(d.amount);

  return set;
}

function stripTrailingZeros(s: string): string {
  if (!s.includes(".")) return s;
  return s.replace(/\.?0+$/, "");
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
