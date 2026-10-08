/**
 * Deterministic ledger answers for chat. Every number comes straight from the
 * snapshot; the AI persona line is added separately and never replaces these.
 * Output is Telegram HTML.
 */
import type { LedgerPeriod, LedgerQuestionKind } from "../humor/intent.js";
import { escapeHtml } from "../../telegram/announcements.js";
import { formatCents, type LedgerSnapshot, type NamedAmount } from "./snapshot.js";

const DAY_MS = 24 * 60 * 60 * 1000;
const MAX_LINES = 10;

const PERIOD_LABEL: Record<LedgerPeriod, string> = {
  week: "this week",
  month: "this month",
  all: "so far",
};

export function renderLedgerFacts(
  kind: LedgerQuestionKind,
  period: LedgerPeriod,
  s: LedgerSnapshot,
  now = new Date(),
): string {
  switch (kind) {
    case "my_balance":
      return myBalance(s);
    case "who_owes":
      return whoOwes(s);
    case "expense_list":
      return expenseList(s, period, now);
    case "totals":
      return totals(s, period);
    case "pending":
      return pending(s);
    case "overview":
      return [totals(s, period), whoOwes(s, 3), pendingLine(s)].join("\n\n");
  }
}

const b = (name: string) => `<b>${escapeHtml(name)}</b>`;
const money = (s: LedgerSnapshot, cents: number) => `${formatCents(cents)} ${escapeHtml(s.currency)}`;

function joinAmounts(s: LedgerSnapshot, list: NamedAmount[]): string {
  const parts = list.map((x) => `${b(x.name)} ${money(s, x.cents)}`);
  return parts.length <= 1 ? (parts[0] ?? "") : `${parts.slice(0, -1).join(", ")} and ${parts.at(-1)}`;
}

function myBalance(s: LedgerSnapshot): string {
  if (!s.asker) {
    return "I can't find you on the books yet. Say something in the group or open the app once, then ask again.";
  }
  const { owes, owedBy } = s.asker;
  if (owes.length === 0 && owedBy.length === 0) {
    return "You're all square. Nobody owes you and you owe nobody.";
  }
  const lines: string[] = [];
  if (owes.length) lines.push(`You owe ${joinAmounts(s, owes)}.`);
  for (const o of owedBy) lines.push(`${b(o.name)} owes you ${money(s, o.cents)}.`);
  return lines.join("\n");
}

function whoOwes(s: LedgerSnapshot, limit = MAX_LINES): string {
  if (s.openDebts.length === 0) return "✅ All square. Nobody owes anybody.";
  const lines = s.openDebts
    .slice(0, limit)
    .map((d) => `• ${b(d.from)} → ${b(d.to)} · ${money(s, d.cents)}`);
  const more = s.openDebts.length - limit;
  if (more > 0) lines.push(`…and ${more} more in the app.`);
  return [`<b>Open debts</b>`, ...lines].join("\n");
}

function inPeriod(date: Date, period: LedgerPeriod, now: Date): boolean {
  if (period === "week") return date.getTime() >= now.getTime() - 7 * DAY_MS;
  if (period === "month") {
    return date.getTime() >= Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1);
  }
  return true;
}

function shortDate(d: Date): string {
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "Africa/Addis_Ababa",
  });
}

function expenseList(s: LedgerSnapshot, period: LedgerPeriod, now: Date): string {
  const rows = s.recentExpenses.filter((e) => inPeriod(e.occurredAt, period, now));
  if (rows.length === 0) return `No expenses recorded ${PERIOD_LABEL[period]}.`;
  const lines = rows.map(
    (e) =>
      `• ${escapeHtml(e.description)}${e.isLoan ? " (loan)" : ""} · ${money(s, e.cents)}, paid by ${b(e.payer)} · ${shortDate(e.occurredAt)}`,
  );
  const heading = period === "all" ? `<b>Latest ${rows.length} expenses</b>` : `<b>Expenses ${PERIOD_LABEL[period]}</b>`;
  return [heading, ...lines].join("\n");
}

function totals(s: LedgerSnapshot, period: LedgerPeriod): string {
  const { stats } = s;
  const spent =
    period === "week" ? stats.weekCents : period === "month" ? stats.monthCents : stats.allTimeCents;
  const lines = [
    `Spent ${PERIOD_LABEL[period]}: <b>${money(s, spent)}</b>`,
    `This week ${money(s, stats.weekCents)} · this month ${money(s, stats.monthCents)} · all time ${money(s, stats.allTimeCents)} (${stats.expenseCount} expenses)`,
  ];
  if (stats.topSpenderMonth) {
    lines.push(`Top spender this month: ${b(stats.topSpenderMonth.name)} (${money(s, stats.topSpenderMonth.cents)})`);
  }
  if (stats.biggest) {
    lines.push(`Biggest expense: ${escapeHtml(stats.biggest.description)} · ${money(s, stats.biggest.cents)} by ${b(stats.biggest.payer)}`);
  }
  return lines.join("\n");
}

function pendingLine(s: LedgerSnapshot): string {
  if (s.pending.count === 0) return "No drafts waiting for review.";
  return `${s.pending.count} draft${s.pending.count === 1 ? "" : "s"} waiting for review in the app.`;
}

function pending(s: LedgerSnapshot): string {
  if (s.pending.count === 0) return pendingLine(s);
  const lines = s.pending.drafts.map(
    (d) => `• ${escapeHtml(d.label)} · ${d.cents == null ? "amount unknown" : money(s, d.cents)}`,
  );
  return [pendingLine(s), ...lines].join("\n");
}
