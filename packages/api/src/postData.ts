/**
 * Real numbers for message design previews and test sends: the same weekly
 * report and payment checklist a group would get, built from its ledger.
 */
import type { PaymentsPostData, WeeklyPostData } from "@jemaw/shared/posts";
import type { Db } from "./db.js";
import { loadGroupLedger, type GroupLedger } from "./ledger.js";
import { decimalToCents } from "@jemaw/shared/types";

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

const shortDate = (d: Date) =>
  d.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "Africa/Addis_Ababa" });

export interface DesignMemberOption {
  memberId: string;
  name: string;
  netCents: number;
}

export interface GroupPostData {
  groupName: string;
  weekly: WeeklyPostData;
  payments: PaymentsPostData;
  /** Whose payments `payments` shows, and who else can be picked. */
  paymentsMemberId: string | null;
  members: DesignMemberOption[];
}

function weekly(ledger: GroupLedger, now: Date): WeeklyPostData {
  const since = new Date(now.getTime() - WEEK_MS);
  const nameOf = (id: string) => ledger.members.find((m) => m.id === id)?.displayName ?? "Member";
  const thisWeek = ledger.expenses
    .filter((e) => e.kind !== "loan" && e.occurredAt >= since)
    .sort((a, b) => b.occurredAt.getTime() - a.occurredAt.getTime());
  const settled = ledger.settlements.filter((s) => (s.markedPaidAt ?? s.createdAt) >= since);
  return {
    groupName: ledger.group.name,
    currency: ledger.group.defaultCurrency,
    periodLabel: `${shortDate(since)} – ${shortDate(now)}`,
    spentCents: thisWeek.reduce((a, e) => a + e.amountCents, 0),
    expenseCount: thisWeek.length,
    settledCents: settled.reduce((a, s) => a + decimalToCents(s.amount), 0),
    memberCount: ledger.members.filter((m) => m.isActive).length,
    standings: ledger.members
      .map((m) => ({ name: m.displayName, netCents: ledger.nets.get(m.id) ?? 0 }))
      .sort((a, b) => b.netCents - a.netCents),
    debts: ledger.transfers
      .map((t) => ({ from: nameOf(t.fromMemberId), to: nameOf(t.toMemberId), cents: t.amountCents }))
      .sort((a, b) => b.cents - a.cents),
    expenses: thisWeek.map((e) => ({
      description: e.description,
      cents: e.amountCents,
      payer: nameOf(e.payerMemberId),
      date: shortDate(e.occurredAt),
    })),
    // The AI writes the comment when the bot sends the real report.
    narrative: null,
  };
}

function payments(ledger: GroupLedger, memberId: string | null): PaymentsPostData {
  const nameOf = (id: string) => ledger.members.find((m) => m.id === id)?.displayName ?? "Member";
  const member = ledger.members.find((m) => m.id === memberId);
  return {
    currency: ledger.group.defaultCurrency,
    name: member?.displayName ?? null,
    owes: ledger.transfers
      .filter((t) => t.fromMemberId === memberId)
      .map((t) => ({ name: nameOf(t.toMemberId), cents: t.amountCents })),
    owedBy: ledger.transfers
      .filter((t) => t.toMemberId === memberId)
      .map((t) => ({ name: nameOf(t.fromMemberId), cents: t.amountCents })),
    note: null,
  };
}

export async function loadGroupPostData(
  db: Db,
  groupId: string,
  opts: { memberId?: string; now?: Date } = {},
): Promise<GroupPostData | null> {
  const ledger = await loadGroupLedger(db, groupId);
  if (!ledger) return null;
  const members = ledger.members
    .filter((m) => m.isActive)
    .map((m) => ({ memberId: m.id, name: m.displayName, netCents: ledger.nets.get(m.id) ?? 0 }))
    .sort((a, b) => a.netCents - b.netCents);
  // Default to whoever owes the most, so the checklist has something in it.
  const pick = members.find((m) => m.memberId === opts.memberId)?.memberId ?? members[0]?.memberId ?? null;
  return {
    groupName: ledger.group.name,
    weekly: weekly(ledger, opts.now ?? new Date()),
    payments: payments(ledger, pick),
    paymentsMemberId: pick,
    members,
  };
}
