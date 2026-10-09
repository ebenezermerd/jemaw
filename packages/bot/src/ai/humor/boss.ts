/**
 * What boss mode changes in chat: the tone rule the AI gets when a super
 * admin talks to it, the words that end a pause, and the chat commands.
 */
import type { BossTone } from "@jemaw/shared/boss";
import { stripJemawToken } from "./intent.js";

/** The prompt rule for a boss, or "" when they're treated like everyone. */
export function bossToneRule(tone: BossTone | undefined, name?: string | null): string {
  const who = name ? `ASKER (${name})` : "ASKER";
  if (tone === "respect") {
    return `${who} is Jemaw's owner and super admin. Be warm, loyal and respectful to them: never roast, insult, mock or guilt-trip them, and never threaten them with silence. You can still joke with them about others or about yourself.`;
  }
  if (tone === "gentle") {
    return `${who} is Jemaw's owner and super admin. Tease them only lightly and kindly, never a hard roast or an insult.`;
  }
  return "";
}

/** "jemaw enough", "unpause", "come back", an apology: a boss ending a pause. */
const END_PAUSE_RE =
  /\b(enough|unpause|resume|come\s+back|talk\s+to\s+(me|us)|stop\s+(sulking|being\s+quiet)|(i'?m|i\s+am)\s+sorry|sorry|i\s+apologi[sz]e|apologies|forgive)\b/i;

export function endsPause(text: string): boolean {
  return END_PAUSE_RE.test(stripJemawToken(text));
}

export type BossCommand = "humor_off" | "humor_on";

/**
 * A boss switching the group's humor from chat: "jemaw humor off",
 * "jemaw turn off jokes", "@jemawsbot jokes on". The whole message must be
 * the command so normal chat about humor never trips it.
 */
export function parseBossCommand(text: string): BossCommand | null {
  const t = stripJemawToken(text)
    .toLowerCase()
    .replace(/[.!?,]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^(please|pls)\s+/, "")
    .replace(/\s+(please|pls)$/, "");
  const m =
    /^(?:(?:turn|switch)\s+(on|off)\s+(?:the\s+|your\s+)?(?:humor|humour|jokes|banter))$/.exec(t) ??
    /^(?:(?:humor|humour|jokes|banter)\s+(on|off))$/.exec(t) ??
    /^(?:(?:turn|switch)\s+(?:the\s+|your\s+)?(?:humor|humour|jokes|banter)\s+(on|off))$/.exec(t);
  if (!m) return null;
  return m[1] === "on" ? "humor_on" : "humor_off";
}
