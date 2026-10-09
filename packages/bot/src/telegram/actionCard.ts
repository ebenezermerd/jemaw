// The Confirm/Cancel card for a chat action, and its button data.
import type { ChatAction } from "@jemaw/shared/schema";
import type { ActionOption } from "../actions/types.js";
import { escapeHtml } from "./announcements.js";

export interface CardButton {
  text: string;
  callback_data: string;
  style?: "primary" | "success" | "danger";
}

export type CardOp = { kind: "toggle"; index: number } | { kind: "all" } | { kind: "ok" } | { kind: "no" };

const DATA_RE = /^a:([0-9a-f]{8}):(t(\d{1,2})|all|ok|no)$/;

export function cardData(actionId: string, op: string): string {
  return `a:${actionId.slice(0, 8)}:${op}`;
}

export function parseCardData(data: string): { idPrefix: string; op: CardOp } | null {
  const m = DATA_RE.exec(data);
  if (!m) return null;
  const op: CardOp =
    m[3] != null ? { kind: "toggle", index: Number(m[3]) } : m[2] === "all" ? { kind: "all" } : m[2] === "ok" ? { kind: "ok" } : { kind: "no" };
  return { idPrefix: m[1]!, op };
}

const short = (s: string, n = 56) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

export function renderActionCard(action: Pick<ChatAction, "id" | "options" | "selected" | "payload">, title: string): {
  text: string;
  reply_markup: { inline_keyboard: CardButton[][] };
} {
  const options = action.options as ActionOption[];
  const selected = new Set(action.selected as number[]);
  const payload = action.payload as { multi?: boolean; more?: number };
  const rows: CardButton[][] = options.map((o, i) => [
    { text: `${selected.has(i) ? "☑" : "☐"} ${short(o.label)}`, callback_data: cardData(action.id, `t${i}`) },
  ]);
  if (payload.multi && options.length > 1) {
    rows.push([{ text: selected.size === options.length ? "Clear all" : "Select all", callback_data: cardData(action.id, "all") }]);
  }
  rows.push([
    { text: options.length ? `Confirm${selected.size ? ` (${selected.size})` : ""}` : "Confirm", callback_data: cardData(action.id, "ok"), style: "success" },
    { text: "Cancel", callback_data: cardData(action.id, "no"), style: "danger" },
  ]);
  const more = payload.more ? `\n<i>${payload.more} more in the app.</i>` : "";
  return { text: `${escapeHtml(title)}${more}`, reply_markup: { inline_keyboard: rows } };
}

export function toggleSelection(selected: number[], op: CardOp, count: number, multi: boolean): number[] {
  if (op.kind === "all") return selected.length === count ? [] : Array.from({ length: count }, (_, i) => i);
  if (op.kind !== "toggle" || op.index < 0 || op.index >= count) return selected;
  if (!multi) return selected.includes(op.index) ? [] : [op.index];
  return selected.includes(op.index) ? selected.filter((i) => i !== op.index) : [...selected, op.index].sort((a, b) => a - b);
}
