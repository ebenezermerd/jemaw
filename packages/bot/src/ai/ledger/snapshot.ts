/**
 * Ledger snapshot for chat: the group's balances, debts, recent expenses,
 * spending stats and pending drafts, resolved to display names and seen from
 * the asker's side. Numbers here are the source of truth for ledger answers;
 * the AI only adds a persona line around them.
 */
import type { Db } from "../../db.js";
import type { Group, Member, Suggestion } from "@jemaw/shared/schema";
import type { LedgerHighlights } from "@jemaw/shared/humor";
import { centsToDecimal, decimalToCents } from "@jemaw/shared/types";
import { loadLedger } from "../../domain/ledger.js";
import type { MemberNet } from "../../domain/balances.js";
import type { Transfer } from "../../domain/settle.js";
import { listPendingSuggestions, type ExpenseWithShares } from "../../repo.js";
import { groupDigits } from "../../telegram/announcements.js";

const DAY_MS = 24 * 60 * 60 * 1000;
const PENDING_DRAFTS = 10;

export interface NamedAmount {
  name: string;
  cents: number;
}

export interface LedgerSnapshot {
  currency: string;
  asker: {
    name: string;
    netCents: number;
    owes: NamedAmount[];
    owedBy: NamedAmount[];
    /** Expenses the asker fronted (not loans), all time. */
    paidCents: number;
    paidCount: number;
  } | null;
  /** Positive net = owed money. Largest first. */
  balances: { name: string; netCents: number }[];
  openDebts: { from: string; to: string; cents: number }[];
  /** Every live expense, newest first. */
  expenses: {
    description: string;
    cents: number;
    payer: string;
    occurredAt: Date;
    participants: number;
    isLoan: boolean;
    askerPaid: boolean;
    askerShared: boolean;
  }[];
  stats: {
    weekCents: number;
    monthCents: number;
    allTimeCents: number;
    expenseCount: number;
    topSpenderMonth: NamedAmount | null;
    topSpenderAllTime: NamedAmount | null;
    /** Everyone who fronted expenses (not loans), all time, largest first. */
    paidByMember: NamedAmount[];
    biggest: { description: string; cents: number; payer: string } | null;
  };
  pending: { count: number; drafts: { label: string; cents: number | null; payer: string | null }[] };
}

export interface LedgerSnapshotInput {
  members: Member[];
  currency: string;
  liveExpenses: ExpenseWithShares[];
  nets: MemberNet[];
  transfers: Transfer[];
  pending: Suggestion[];
  askerTelegramId: bigint | null;
  now: Date;
}

export function computeLedgerSnapshot(i: LedgerSnapshotInput): LedgerSnapshot {
  const nameOf = (id: string | null) =>
    i.members.find((m) => m.id === id)?.displayName ?? "Someone";
  const byAmountDesc = <T extends { cents: number }>(a: T, b: T) => b.cents - a.cents;

  const openDebts = i.transfers
    .map((t) => ({
      from: nameOf(t.fromMemberId),
      to: nameOf(t.toMemberId),
      cents: t.amountCents,
      fromId: t.fromMemberId,
      toId: t.toMemberId,
    }))
    .sort(byAmountDesc);

  const askerMember =
    i.askerTelegramId == null
      ? undefined
      : i.members.find((m) => m.telegramUserId === i.askerTelegramId);
  const askerPaid = askerMember
    ? i.liveExpenses.filter(
        (e) => e.expense.payerMemberId === askerMember.id && e.expense.kind !== "loan",
      )
    : [];
  const asker = askerMember
    ? {
        paidCents: askerPaid.reduce((acc, e) => acc + decimalToCents(e.expense.amount), 0),
        paidCount: askerPaid.length,
        name: askerMember.displayName,
        netCents: i.nets.find((n) => n.memberId === askerMember.id)?.netCents ?? 0,
        owes: openDebts
          .filter((d) => d.fromId === askerMember.id)
          .map((d) => ({ name: d.to, cents: d.cents })),
        owedBy: openDebts
          .filter((d) => d.toId === askerMember.id)
          .map((d) => ({ name: d.from, cents: d.cents })),
      }
    : null;

  const weekStart = i.now.getTime() - 7 * DAY_MS;
  const monthStart = Date.UTC(i.now.getUTCFullYear(), i.now.getUTCMonth(), 1);
  const spending = i.liveExpenses.filter((e) => e.expense.kind !== "loan");
  const sumSince = (since: number) =>
    spending
      .filter((e) => e.expense.occurredAt.getTime() >= since)
      .reduce((acc, e) => acc + decimalToCents(e.expense.amount), 0);

  const paidSince = (since: number): NamedAmount[] => {
    const paid = new Map<string, number>();
    for (const e of spending) {
      if (e.expense.occurredAt.getTime() < since) continue;
      const id = e.expense.payerMemberId;
      paid.set(id, (paid.get(id) ?? 0) + decimalToCents(e.expense.amount));
    }
    return [...paid.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([id, cents]) => ({ name: nameOf(id), cents }));
  };
  const topPayerSince = (since: number) => paidSince(since)[0] ?? null;
  const biggest = [...spending].sort(
    (a, b) => decimalToCents(b.expense.amount) - decimalToCents(a.expense.amount),
  )[0];

  return {
    currency: i.currency,
    asker,
    balances: i.nets
      .map((n) => ({ name: nameOf(n.memberId), netCents: n.netCents }))
      .sort((a, b) => b.netCents - a.netCents),
    openDebts: openDebts.map(({ from, to, cents }) => ({ from, to, cents })),
    expenses: i.liveExpenses.map((e) => ({
      description: e.expense.description,
      cents: decimalToCents(e.expense.amount),
      payer: nameOf(e.expense.payerMemberId),
      occurredAt: e.expense.occurredAt,
      participants: e.shares.length,
      isLoan: e.expense.kind === "loan",
      askerPaid: askerMember != null && e.expense.payerMemberId === askerMember.id,
      askerShared: askerMember != null && e.shares.some((sh) => sh.memberId === askerMember.id),
    })),
    stats: {
      weekCents: sumSince(weekStart),
      monthCents: sumSince(monthStart),
      allTimeCents: sumSince(0),
      expenseCount: spending.length,
      topSpenderMonth: topPayerSince(monthStart),
      topSpenderAllTime: topPayerSince(0),
      paidByMember: paidSince(0),
      biggest: biggest
        ? {
            description: biggest.expense.description,
            cents: decimalToCents(biggest.expense.amount),
            payer: nameOf(biggest.expense.payerMemberId),
          }
        : null,
    },
    pending: {
      count: i.pending.length,
      drafts: i.pending.slice(0, PENDING_DRAFTS).map((s) => ({
        label: s.description,
        cents: s.amount == null ? null : decimalToCents(s.amount),
        payer: s.kind === "settlement" ? null : s.payerMemberId ? nameOf(s.payerMemberId) : null,
      })),
    },
  };
}

export async function buildLedgerSnapshot(
  db: Db,
  group: Group,
  askerTelegramId: bigint | null,
  now = new Date(),
): Promise<LedgerSnapshot> {
  const [ledger, pending] = await Promise.all([
    loadLedger(db, group.id),
    listPendingSuggestions(db, group.id),
  ]);
  return computeLedgerSnapshot({
    members: ledger.members,
    currency: group.defaultCurrency,
    liveExpenses: ledger.liveExpenses,
    nets: ledger.nets,
    transfers: ledger.transfers,
    pending,
    askerTelegramId,
    now,
  });
}

/** Display form: "1,200", "123.45", "-300". */
export function formatCents(cents: number): string {
  return groupDigits(centsToDecimal(cents).replace(/\.00$/, ""));
}

/** Every amount in the snapshot, in the plain forms the verifier matches. */
export function ledgerNumberTokens(s: LedgerSnapshot): string[] {
  const cents: number[] = [
    ...(s.asker ? [s.asker.netCents, s.asker.paidCents, ...s.asker.owes.map((o) => o.cents), ...s.asker.owedBy.map((o) => o.cents)] : []),
    ...s.balances.map((b) => b.netCents),
    ...s.openDebts.map((d) => d.cents),
    ...s.expenses.map((e) => e.cents),
    s.stats.weekCents,
    s.stats.monthCents,
    s.stats.allTimeCents,
    ...(s.stats.topSpenderMonth ? [s.stats.topSpenderMonth.cents] : []),
    ...(s.stats.topSpenderAllTime ? [s.stats.topSpenderAllTime.cents] : []),
    ...s.stats.paidByMember.map((p) => p.cents),
    ...(s.stats.biggest ? [s.stats.biggest.cents] : []),
    ...s.pending.drafts.flatMap((d) => (d.cents == null ? [] : [d.cents])),
  ];
  const out = new Set<string>([
    String(s.stats.expenseCount),
    String(s.pending.count),
    String(s.expenses.length),
    ...(s.asker ? [String(s.asker.paidCount)] : []),
  ]);
  for (const c of cents) {
    const plain = centsToDecimal(Math.abs(c));
    out.add(plain);
    out.add(plain.replace(/\.00$/, ""));
  }
  return [...out];
}

export function ledgerNames(s: LedgerSnapshot): string[] {
  const names = new Set<string>(s.balances.map((b) => b.name));
  if (s.asker) names.add(s.asker.name);
  return [...names];
}

/** Plain decimal without separators or trailing ".00": the verifier's token form. */
export function plainAmount(cents: number): string {
  return centsToDecimal(Math.abs(cents)).replace(/\.00$/, "");
}

/** The few real figures chat banter may brag or roast with. */
export function ledgerHighlights(s: LedgerSnapshot): LedgerHighlights {
  const named = (name: string, cents: number) => ({ name, amount: plainAmount(cents) });
  const debtor = [...s.balances].sort((a, b) => a.netCents - b.netCents)[0];
  const creditor = s.balances[0];
  return {
    currency: s.currency,
    ...(s.asker?.owes.length ? { asker_owes: s.asker.owes.map((o) => named(o.name, o.cents)) } : {}),
    ...(s.asker?.owedBy.length ? { asker_owed_by: s.asker.owedBy.map((o) => named(o.name, o.cents)) } : {}),
    ...(s.stats.topSpenderMonth
      ? { top_spender_this_month: named(s.stats.topSpenderMonth.name, s.stats.topSpenderMonth.cents) }
      : {}),
    ...(debtor && debtor.netCents < 0 ? { biggest_debtor: named(debtor.name, debtor.netCents) } : {}),
    ...(creditor && creditor.netCents > 0 ? { top_creditor: named(creditor.name, creditor.netCents) } : {}),
    spent_this_week: plainAmount(s.stats.weekCents),
  };
}
