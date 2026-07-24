/**
 * Weekly digest: KPI computation over a time window plus the structured HTML
 * message posted to the group chat. The optional AI narrative (exactly two
 * sentences) is generated elsewhere and slotted in.
 *
 * Pure — no DB, no I/O. Integer cents throughout.
 */
import { escapeHtml, groupDigits } from "../telegram/announcements.js";
import { centsToDecimal } from "@jemaw/shared/types";

export interface ExpenseForDigest {
  payerMemberId: string;
  amountCents: number;
  occurredAt: Date;
  kind: "expense" | "loan";
}

export interface SettlementForDigest {
  amountCents: number;
  when: Date;
}

export interface WeeklyKpis {
  spentCents: number;
  expenseCount: number;
  settledCents: number;
  settlementCount: number;
  topPayerName: string | null;
  topPayerCents: number;
}

export function computeWeeklyKpis(
  expenses: ExpenseForDigest[],
  settlements: SettlementForDigest[],
  nameOf: (memberId: string) => string,
  since: Date,
): WeeklyKpis {
  // Loans affect balances but are not shared spending — exclude from KPIs.
  const weekExpenses = expenses.filter(
    (e) => e.occurredAt >= since && e.kind === "expense",
  );
  const weekSettlements = settlements.filter((s) => s.when >= since);

  const paidBy = new Map<string, number>();
  let spent = 0;
  for (const e of weekExpenses) {
    spent += e.amountCents;
    paidBy.set(e.payerMemberId, (paidBy.get(e.payerMemberId) ?? 0) + e.amountCents);
  }
  let topPayerId: string | null = null;
  let topPayerCents = 0;
  for (const [id, cents] of paidBy) {
    if (cents > topPayerCents) {
      topPayerId = id;
      topPayerCents = cents;
    }
  }

  return {
    spentCents: spent,
    expenseCount: weekExpenses.length,
    settledCents: weekSettlements.reduce((sum, s) => sum + s.amountCents, 0),
    settlementCount: weekSettlements.length,
    topPayerName: topPayerId ? nameOf(topPayerId) : null,
    topPayerCents,
  };
}

export interface DigestInput {
  groupName: string;
  currency: string;
  kpis: WeeklyKpis;
  /** all time standings; zero nets are dropped for brevity */
  standings: { name: string; netCents: number }[];
  openDebts: { fromName: string; toName: string; amountCents: number }[];
  /** exactly two sentences from the AI, or null when unavailable */
  narrative: string | null;
}

function money(cents: number, currency: string): string {
  return `${groupDigits(centsToDecimal(cents))} ${escapeHtml(currency)}`;
}

/** Fixed width name column for the monospace standings box. */
function padName(name: string, width: number): string {
  const cut = name.length > width ? `${name.slice(0, width - 1)}…` : name;
  return cut.padEnd(width, " ");
}

const NAME_COL = 12;

/**
 * Structured Telegram HTML weekly summary using the native surfaces Telegram
 * gives us: blockquote boxes for sections, a monospace <pre> table for the
 * standings so amounts align, and an expandable blockquote when the open
 * debt list gets long.
 */
export function formatWeeklyDigest(i: DigestInput): string {
  const { kpis } = i;
  const sections: string[] = [];

  sections.push(`📊 <b>Jemaw · Weekly summary</b>\n<i>${escapeHtml(i.groupName)}</i>`);

  const week: string[] = [];
  week.push(
    `${money(kpis.spentCents, i.currency)} spent · ${kpis.expenseCount} expense${kpis.expenseCount === 1 ? "" : "s"}`,
  );
  week.push(
    `${money(kpis.settledCents, i.currency)} paid back · ${kpis.settlementCount} settlement${kpis.settlementCount === 1 ? "" : "s"}`,
  );
  if (kpis.topPayerName) {
    week.push(
      `Top payer: ${escapeHtml(kpis.topPayerName)} · ${money(kpis.topPayerCents, i.currency)}`,
    );
  }
  sections.push(`<b>This week</b>\n<blockquote>${week.join("\n")}</blockquote>`);

  const standings = i.standings.filter((s) => s.netCents !== 0);
  if (standings.length > 0) {
    const width = Math.min(
      NAME_COL,
      Math.max(...standings.map((s) => s.name.length)),
    );
    const rows = standings
      .slice()
      .sort((a, b) => b.netCents - a.netCents)
      .map((s) => {
        const dot = s.netCents > 0 ? "🟢" : "🔴";
        const sign = s.netCents > 0 ? "+" : "−";
        const amount = `${sign}${groupDigits(centsToDecimal(Math.abs(s.netCents)))}`;
        return `${dot} ${escapeHtml(padName(s.name, width))} ${escapeHtml(amount)}`;
      });
    sections.push(
      `<b>Standings</b> <i>(${escapeHtml(i.currency)})</i>\n<pre>${rows.join("\n")}</pre>`,
    );
  }

  if (i.openDebts.length > 0) {
    const rows = i.openDebts.map(
      (d) =>
        `${escapeHtml(d.fromName)} → ${escapeHtml(d.toName)} · ${money(d.amountCents, i.currency)}`,
    );
    // Long lists collapse behind Telegram's expandable blockquote.
    const tag = rows.length > 3 ? "<blockquote expandable>" : "<blockquote>";
    sections.push(`<b>Open debts</b>\n${tag}${rows.join("\n")}</blockquote>`);
  } else {
    sections.push(`✅ <b>All square</b> — no open debts.`);
  }

  if (i.narrative) {
    sections.push(`<i>${escapeHtml(i.narrative)}</i>`);
  }

  return sections.join("\n\n");
}
