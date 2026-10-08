/**
 * Ledger snapshot for chat: the group's balances, debts, recent expenses,
 * spending stats and pending drafts, resolved to display names and seen from
 * the asker's side. Numbers here are the source of truth for ledger answers;
 * the AI only adds a persona line around them.
 */
import type { Db } from "../../db.js";
import type { Group, Member, Suggestion } from "@jemaw/shared/schema";
import { centsToDecimal, decimalToCents } from "@jemaw/shared/types";
import { loadLedger } from "../../domain/ledger.js";
import type { MemberNet } from "../../domain/balances.js";
import type { Transfer } from "../../domain/settle.js";
import { listPendingSuggestions, type ExpenseWithShares } from "../../repo.js";
import { groupDigits } from "../../telegram/announcements.js";

const DAY_MS = 24 * 60 * 60 * 1000;
const RECENT_EXPENSES = 10;
const PENDING_DRAFTS = 5;

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
  } | null;
  /** Positive net = owed money. Largest first. */
  balances: { name: string; netCents: number }[];
  openDebts: { from: string; to: string; cents: number }[];
  recentExpenses: {
    description: string;
    cents: number;
    payer: string;
    occurredAt: Date;
    participants: number;
    isLoan: boolean;
  }[];
  stats: {
    weekCents: number;
    monthCents: number;
    allTimeCents: number;
    expenseCount: number;
    topSpenderMonth: NamedAmount | null;
    biggest: { description: string; cents: number; payer: string } | null;
  };
  pending: { count: number; drafts: { label: string; cents: number | null }[] };
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
  const asker = askerMember
    ? {
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

  const paidThisMonth = new Map<string, number>();
  for (const e of spending) {
    if (e.expense.occurredAt.getTime() < monthStart) continue;
    const id = e.expense.payerMemberId;
    paidThisMonth.set(id, (paidThisMonth.get(id) ?? 0) + decimalToCents(e.expense.amount));
  }
  const top = [...paidThisMonth.entries()].sort((a, b) => b[1] - a[1])[0];
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
    recentExpenses: i.liveExpenses.slice(0, RECENT_EXPENSES).map((e) => ({
      description: e.expense.description,
      cents: decimalToCents(e.expense.amount),
      payer: nameOf(e.expense.payerMemberId),
      occurredAt: e.expense.occurredAt,
      participants: e.shares.length,
      isLoan: e.expense.kind === "loan",
    })),
    stats: {
      weekCents: sumSince(weekStart),
      monthCents: sumSince(monthStart),
      allTimeCents: sumSince(0),
      expenseCount: spending.length,
      topSpenderMonth: top ? { name: nameOf(top[0]), cents: top[1] } : null,
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
    ...(s.asker ? [s.asker.netCents, ...s.asker.owes.map((o) => o.cents), ...s.asker.owedBy.map((o) => o.cents)] : []),
    ...s.balances.map((b) => b.netCents),
    ...s.openDebts.map((d) => d.cents),
    ...s.recentExpenses.map((e) => e.cents),
    s.stats.weekCents,
    s.stats.monthCents,
    s.stats.allTimeCents,
    ...(s.stats.topSpenderMonth ? [s.stats.topSpenderMonth.cents] : []),
    ...(s.stats.biggest ? [s.stats.biggest.cents] : []),
    ...s.pending.drafts.flatMap((d) => (d.cents == null ? [] : [d.cents])),
  ];
  const out = new Set<string>([
    String(s.stats.expenseCount),
    String(s.pending.count),
    String(s.recentExpenses.length),
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
