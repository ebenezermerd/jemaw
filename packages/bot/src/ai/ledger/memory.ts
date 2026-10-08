/**
 * Short memory of each member's last ledger question, so "that's wrong, I said
 * what I paid" can redo it. In-process on purpose: one bot instance, and a
 * restart forgetting a 15-minute-old question is harmless.
 */
import type { LedgerQuery } from "../humor/intent.js";

const MAX_AGE_MS = 15 * 60 * 1000;

export interface RememberedQuestion {
  text: string;
  query: LedgerQuery;
  at: number;
}

const lastByAsker = new Map<string, RememberedQuestion>();

const key = (groupId: string, askerTelegramId: bigint | null) =>
  `${groupId}:${askerTelegramId ?? "anon"}`;

export function rememberLedgerQuestion(
  groupId: string,
  askerTelegramId: bigint | null,
  text: string,
  query: LedgerQuery,
  now = Date.now(),
): void {
  lastByAsker.set(key(groupId, askerTelegramId), { text, query, at: now });
}

export function recallLedgerQuestion(
  groupId: string,
  askerTelegramId: bigint | null,
  now = Date.now(),
): RememberedQuestion | null {
  const hit = lastByAsker.get(key(groupId, askerTelegramId));
  if (!hit || now - hit.at > MAX_AGE_MS) return null;
  return hit;
}

export const CORRECTION_LINES = [
  "🙈 My bad. Here's what you actually asked for:",
  "🤦 Misread you. Let me try that again:",
  "😅 Fair, that was off. Here you go:",
];
