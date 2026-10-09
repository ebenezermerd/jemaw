/**
 * Deterministic ledger answers for chat. Every number comes straight from the
 * snapshot; the AI persona line is added separately and never replaces these.
 * Output is Telegram HTML.
 */
import type { LedgerPeriod, LedgerQuery } from "../humor/intent.js";
import { escapeHtml } from "../../telegram/announcements.js";
import { formatCents, type LedgerSnapshot, type NamedAmount } from "./snapshot.js";

const DAY_MS = 24 * 60 * 60 * 1000;
const MAX_LINES = 10;
type ExpenseRow = LedgerSnapshot["expenses"][number];

const PERIOD_LABEL: Record<LedgerPeriod, string> = {
  week: "this week",
  month: "this month",
  all: "so far",
};

export function renderLedgerFacts(
  q: LedgerQuery,
  s: LedgerSnapshot,
  now = new Date(),
): string {
  switch (q.kind) {
    case "whoami":
      return whoAmI(s);
    case "leaderboard":
      return leaderboard(s);
    case "my_balance":
      return myBalance(s);
    case "who_owes":
      return whoOwes(s);
    case "expense_list":
      return expenseList(s, q, now);
    case "totals":
      return totals(s, q.period, now, q.mine && s.asker ? q.mine : undefined);
    case "pending":
      return pending(s);
    case "overview":
      return [totals(s, q.period, now), whoOwes(s, 3), pendingLine(s)].join("\n\n");
  }
}

const NOT_FOUND =
  "I can't find you on the books yet. Say something in the group or open the app once, then ask again.";

/**
 * "Who's the rich one", read from spending rather than real wealth. With humor
 * on, Jemaw answers this in its own voice instead; this is the plain version.
 */
function leaderboard(s: LedgerSnapshot): string {
  const rich = s.stats.paidByMember[0];
  if (!rich) return "Nobody has fronted anything yet.";
  const owing = [...s.balances].sort((a, z) => a.netCents - z.netCents)[0];
  const first = `${escapeHtml(rich.name)} has fronted the most, ${money(s, rich.cents)}.`;
  return owing && owing.netCents < 0
    ? `${first} ${escapeHtml(owing.name)} owes the most, ${money(s, -owing.netCents)}.`
    : `${first} Nobody owes anybody right now.`;
}

function whoAmI(s: LedgerSnapshot): string {
  if (!s.asker) return NOT_FOUND;
  const a = s.asker;
  const paid =
    a.paidCount === 0
      ? "You haven't fronted any expenses here yet."
      : `You've fronted ${a.paidCount} expense${a.paidCount === 1 ? "" : "s"} (${money(s, a.paidCents)}).`;
  return [`You're ${b(a.name)}.`, paid, myBalance(s)].join("\n");
}

const b = (name: string) => `<b>${escapeHtml(name)}</b>`;
const money = (s: LedgerSnapshot, cents: number) => `${formatCents(cents)} ${escapeHtml(s.currency)}`;

function joinAmounts(s: LedgerSnapshot, list: NamedAmount[]): string {
  const parts = list.map((x) => `${b(x.name)} ${money(s, x.cents)}`);
  return parts.length <= 1 ? (parts[0] ?? "") : `${parts.slice(0, -1).join(", ")} and ${parts.at(-1)}`;
}

function myBalance(s: LedgerSnapshot): string {
  if (!s.asker) return NOT_FOUND;
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
  return [`<b>Open payments</b>`, ...lines].join("\n");
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

function windowLabel(q: LedgerQuery): string {
  return q.days ? `in the last ${q.days} day${q.days === 1 ? "" : "s"}` : PERIOD_LABEL[q.period];
}

function inWindow(e: ExpenseRow, q: LedgerQuery, now: Date): boolean {
  if (q.days) return e.occurredAt.getTime() > now.getTime() - q.days * DAY_MS;
  return inPeriod(e.occurredAt, q.period, now);
}

function expenseLine(s: LedgerSnapshot, e: ExpenseRow): string {
  return `• ${escapeHtml(e.description)}${e.isLoan ? " (loan)" : ""} · ${money(s, e.cents)}, paid by ${b(e.payer)} · ${shortDate(e.occurredAt)}`;
}

function expenseList(s: LedgerSnapshot, q: LedgerQuery, now: Date): string {
  if (q.mine && !s.asker) return NOT_FOUND;
  const ofMine = s.expenses.filter((e) =>
    q.mine === "paid" ? e.askerPaid : q.mine === "involved" ? e.askerPaid || e.askerShared : true,
  );
  const rows = ofMine.filter((e) => inWindow(e, q, now)).slice(0, q.limit ?? MAX_LINES);
  const windowed = q.days != null || q.period !== "all";
  if (rows.length === 0) {
    if (!q.mine) return `No expenses recorded ${windowLabel(q)}.`;
    const verb = q.mine === "paid" ? "paid for" : "been part of";
    const empty = `You haven't ${verb} anything ${windowed ? windowLabel(q) : "yet"}.`;
    const latest = ofMine[0];
    return latest
      ? `${empty}\nYour latest was ${escapeHtml(latest.description)} · ${money(s, latest.cents)} on ${shortDate(latest.occurredAt)}.`
      : empty;
  }
  const n = rows.length;
  const plural = n === 1 ? "" : "s";
  // Asked for more than exist: say these are all of them.
  if (!windowed && q.limit && n < q.limit && n === ofMine.length) {
    const what =
      q.mine === "paid"
        ? `expense${plural} you paid`
        : q.mine === "involved"
          ? `expense${plural} you were part of`
          : `expense${plural}`;
    return [`<b>All ${n} ${what}</b>`, ...rows.map((e) => expenseLine(s, e))].join("\n");
  }
  const whose = q.mine === "paid" ? "Your" : q.mine === "involved" ? "Your shared" : "";
  const heading = windowed
    ? `<b>${whose ? `${whose} expenses` : "Expenses"} ${windowLabel(q)}</b>`
    : `<b>${whose ? `${whose} latest` : "Latest"} ${rows.length} expense${rows.length === 1 ? "" : "s"}</b>`;
  return [heading, ...rows.map((e) => expenseLine(s, e))].join("\n");
}

function totals(
  s: LedgerSnapshot,
  period: LedgerPeriod,
  now: Date,
  mine?: "paid" | "involved",
): string {
  const { stats } = s;
  if (mine && s.asker) {
    const rows = s.expenses.filter(
      (e) => !e.isLoan && e.askerPaid && inPeriod(e.occurredAt, period, now),
    );
    const cents = rows.reduce((acc, e) => acc + e.cents, 0);
    return `You paid <b>${money(s, cents)}</b> ${PERIOD_LABEL[period]} across ${rows.length} expense${rows.length === 1 ? "" : "s"}.`;
  }
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
