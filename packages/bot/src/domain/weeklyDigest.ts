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
  const weekExpenses = expenses.filter((e) => e.occurredAt >= since);
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

/** Structured Telegram HTML weekly summary: KPIs, standings, open debts, blurb. */
export function formatWeeklyDigest(i: DigestInput): string {
  const { kpis } = i;
  const sections: string[] = [];

  sections.push(`📊 <b>Jemaw · Weekly summary</b>\n<i>${escapeHtml(i.groupName)}</i>`);

  const week: string[] = [`<b>This week</b>`];
  week.push(
    `•  ${money(kpis.spentCents, i.currency)} spent across ${kpis.expenseCount} expense${kpis.expenseCount === 1 ? "" : "s"}`,
  );
  week.push(
    `•  ${kpis.settlementCount} settlement${kpis.settlementCount === 1 ? "" : "s"} · ${money(kpis.settledCents, i.currency)} paid back`,
  );
  if (kpis.topPayerName) {
    week.push(
      `•  Top payer: ${escapeHtml(kpis.topPayerName)} · ${money(kpis.topPayerCents, i.currency)}`,
    );
  }
  sections.push(week.join("\n"));

  const standings = i.standings.filter((s) => s.netCents !== 0);
  if (standings.length > 0) {
    const rows = standings
      .slice()
      .sort((a, b) => b.netCents - a.netCents)
      .map((s) => {
        const dot = s.netCents > 0 ? "🟢" : "🔴";
        const sign = s.netCents > 0 ? "+" : "−";
        return `${dot} ${escapeHtml(s.name)}  ${sign}${money(Math.abs(s.netCents), i.currency)}`;
      });
    sections.push([`<b>Standings</b>`, ...rows].join("\n"));
  }

  if (i.openDebts.length > 0) {
    const rows = i.openDebts
      .slice(0, 6)
      .map(
        (d) =>
          `→ ${escapeHtml(d.fromName)} owes ${escapeHtml(d.toName)} ${money(d.amountCents, i.currency)}`,
      );
    const extra = i.openDebts.length - rows.length;
    if (extra > 0) rows.push(`…and ${extra} more`);
    sections.push([`<b>Open debts</b>`, ...rows].join("\n"));
  } else {
    sections.push(`✅ <b>All square</b> — no open debts.`);
  }

  if (i.narrative) {
    sections.push(`<i>${escapeHtml(i.narrative)}</i>`);
  }

  return sections.join("\n\n");
}
