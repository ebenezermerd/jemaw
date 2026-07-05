/**
 * Chat announcements for ledger actions taken inside the Mini App. Settling
 * through the app (settle page or an AI suggestion) is invisible to the chat,
 * so the bot posts a structured HTML note that keeps the group informed
 * without anyone opening the app.
 *
 * Pure formatting — sending is the caller's job.
 */
import type { PaymentMethod } from "@jemaw/shared/types";

export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

const METHOD_LABEL: Record<PaymentMethod, string> = {
  cash: "cash",
  bank: "bank transfer",
  telebirr: "Telebirr",
  other: "other",
};

/** Group thousands while keeping decimals: "4565.49" → "4,565.49". */
export function groupDigits(value: string): string {
  const m = /^(-?)(\d+)(\.\d+)?$/.exec(value.trim());
  if (!m) return value;
  const grouped = m[2]!.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return `${m[1]}${grouped}${m[3] ?? ""}`;
}

export interface SettlementAnnouncementInput {
  fromName: string;
  toName: string;
  /** decimal string */
  amount: string;
  currency: string;
  method: PaymentMethod;
  /** descriptions of the expenses this payment covers */
  expenseDescriptions: string[];
  /** decimal string still owed from → to after this payment; null when square */
  remaining: string | null;
  /** where the settlement was recorded */
  source: "app" | "suggestion";
}

/** Telegram HTML message announcing a recorded settlement. */
export function formatSettlementAnnouncement(
  i: SettlementAnnouncementInput,
): string {
  const from = `<b>${escapeHtml(i.fromName)}</b>`;
  const to = `<b>${escapeHtml(i.toName)}</b>`;
  const amount = `<b>${groupDigits(i.amount)} ${escapeHtml(i.currency)}</b>`;

  const lines: string[] = [];
  lines.push(`🤝 <b>Settled up</b>`);
  lines.push(`${from} paid ${to} ${amount} · ${METHOD_LABEL[i.method]}`);

  if (i.expenseDescriptions.length > 0) {
    const shown = i.expenseDescriptions.slice(0, 3).map(escapeHtml);
    const extra = i.expenseDescriptions.length - shown.length;
    lines.push(
      `Covers: ${shown.join(", ")}${extra > 0 ? ` +${extra} more` : ""}`,
    );
  }

  if (i.remaining === null) {
    lines.push(`✅ ${escapeHtml(i.fromName)} and ${escapeHtml(i.toName)} are square now.`);
  } else {
    lines.push(
      `⏳ Still open: ${escapeHtml(i.fromName)} owes ${escapeHtml(i.toName)} ${groupDigits(i.remaining)} ${escapeHtml(i.currency)}.`,
    );
  }

  lines.push(
    `<i>Recorded ${i.source === "suggestion" ? "from an AI suggestion" : "in the app"}.</i>`,
  );
  return lines.join("\n");
}
