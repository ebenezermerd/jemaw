/**
 * Build a short interleaved jemaw conversation thread for follow-up replies.
 */
import type { ConversationThreadTurn } from "@jemaw/shared/humor";

const JEMAW_RE = /(?<![a-z0-9])jemaw(?![a-z0-9])/i;

export function buildThreadTurns(input: {
  /** Recent group messages, any order; we sort by time. */
  messages: Array<{ text: string; sentAt: Date }>;
  /** Recent bot replies, any order. */
  botReplies: Array<{ text: string; createdAt: Date }>;
  /** Max turns to keep (user + jemaw lines). */
  maxTurns?: number;
  /** Only include messages newer than this (ms). Default 2h. */
  maxAgeMs?: number;
}): ConversationThreadTurn[] {
  const maxTurns = input.maxTurns ?? 8;
  const maxAgeMs = input.maxAgeMs ?? 2 * 60 * 60 * 1000;
  const cutoff = Date.now() - maxAgeMs;

  type Row = { t: number; role: "user" | "jemaw"; text: string };
  const rows: Row[] = [];

  for (const m of input.messages) {
    const ts = m.sentAt.getTime();
    if (ts < cutoff) continue;
    if (!JEMAW_RE.test(m.text)) continue;
    const text = sanitizeLine(m.text);
    if (!text) continue;
    rows.push({ t: ts, role: "user", text });
  }
  for (const b of input.botReplies) {
    const ts = b.createdAt.getTime();
    if (ts < cutoff) continue;
    const text = sanitizeLine(b.text);
    if (!text) continue;
    rows.push({ t: ts, role: "jemaw", text });
  }

  rows.sort((a, b) => a.t - b.t);
  const sliced = rows.slice(-maxTurns);
  return sliced.map((r) => ({ role: r.role, text: r.text }));
}

function sanitizeLine(text: string): string {
  return text
    .replace(/\s+/g, " ")
    .replace(/https?:\/\/\S+/gi, "")
    .trim()
    .slice(0, 140);
}
