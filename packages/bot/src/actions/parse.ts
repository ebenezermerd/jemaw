// Keyword fallback for clear action commands; the model handles looser phrasing.
import { stripJemawToken } from "../ai/humor/intent.js";
import { ACTION_KINDS, type ActionKind, type ActionRequest } from "./types.js";

const LEAD = String.raw`^(?:(?:please|pls|can you|could you|go ahead and)\s+)?`;
const NAME = String.raw`([\p{L}][\p{L}'.-]*)`;

const amountOf = (t: string) => /(\d[\d,]*(?:\.\d{1,2})?)/.exec(t)?.[1]?.replace(/,/g, "");

function names(list: string): string[] {
  return list
    .split(/\s*(?:,|\band\b|&)\s*/)
    .map((s) => s.trim())
    .filter(Boolean);
}

export function parseActionByRules(text: string): ActionRequest | null {
  const t = stripJemawToken(text).toLowerCase().replace(/[?!.]+$/g, "").trim();
  const re = (verbs: string) => new RegExp(`${LEAD}(?:${verbs})\\b\\s*(.*)$`, "u");

  let m = re("settle|pay back|mark paid|record (?:a |my )?payment").exec(t);
  if (m) {
    const rest = m[1]!;
    const to = new RegExp(String.raw`\bto\s+${NAME}`, "u").exec(rest)?.[1];
    const owner = new RegExp(String.raw`^${NAME}'s\b`, "u").exec(rest)?.[1];
    const from = /\b(mine|my|me)\b/.test(rest) && !/\bto\s+me\b/.test(rest) ? "me" : owner;
    return { action: "settle", ...(from ? { from } : {}), ...(to ? { to } : {}) };
  }

  m = re("approve|confirm|accept").exec(t);
  if (m) return { action: "approve_drafts", match: m[1]! };
  m = re("dismiss|reject|discard").exec(t);
  if (m) return { action: "dismiss_drafts", match: m[1]! };

  m = re("delete|remove|void|undo").exec(t);
  if (m) {
    const rest = m[1]!;
    if (/\b(payment|settlement)\b/.test(rest)) {
      const to = new RegExp(String.raw`\bto\s+${NAME}`, "u").exec(rest)?.[1];
      const from = /\b(my|mine)\b/.test(rest) ? "me" : undefined;
      return { action: "delete_payment", ...(from ? { from } : {}), ...(to ? { to } : {}), match: rest };
    }
    return { action: "delete_expense", match: rest };
  }

  m = re("add|record|log").exec(t);
  if (m && amountOf(m[1]!)) {
    const rest = m[1]!;
    const description = /\bfor\s+(.+?)(?:\s+(?:with|paid by|split)\b|$)/.exec(rest)?.[1]?.trim();
    const withList = /\bwith\s+(.+?)(?:\s+paid by\b|$)/.exec(rest)?.[1];
    const payer = new RegExp(String.raw`\bpaid by\s+${NAME}`, "u").exec(rest)?.[1];
    return {
      action: "add_expense",
      amount: amountOf(rest)!,
      ...(description ? { description } : {}),
      ...(withList ? { participants: names(withList) } : {}),
      ...(payer ? { from: payer } : {}),
    };
  }
  return null;
}

export function isActionKind(v: unknown): v is ActionKind {
  return typeof v === "string" && (ACTION_KINDS as readonly string[]).includes(v);
}
