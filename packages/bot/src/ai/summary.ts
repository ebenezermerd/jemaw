/**
 * Persisted, always-current group state summary for the AI scan. Recomputed on
 * every ledger change and stored in groups.settings.aiSummary, so a scan reads a
 * compact snapshot instead of re-deriving the whole ledger each time. A version
 * stamp (expense + settlement counts) lets the scan verify freshness and
 * self-heal if a refresh was ever missed.
 */
import type { Db } from "../db.js";
import {
  listMembers,
  listLiveExpenses,
  listSettlements,
  getGroupById,
  mergeGroupSettings,
} from "../repo.js";
import { computeBalances } from "../domain/balances.js";
import { computeSettlement } from "../domain/settle.js";
import { decimalToCents, centsToDecimal } from "@jemaw/shared/types";

export interface AiSummary {
  version: { expenses: number; settlements: number };
  currency: string;
  balances: { name: string; net: string }[];
  openDebts: { from: string; to: string; amount: string }[];
  recentExpenses: { desc: string; amount: string; payer: string }[];
  recentSettlements: { from: string; to: string; amount: string }[];
  updatedAt: string;
}

const RECENT = 5;

/** Compute the summary from the live ledger (the expensive path). */
export async function computeGroupSummary(
  db: Db,
  groupId: string,
  currency: string,
): Promise<AiSummary> {
  const members = await listMembers(db, groupId);
  const liveExpenses = await listLiveExpenses(db, groupId);
  const settlementRows = await listSettlements(db, groupId);
  const nameOf = (id: string) =>
    members.find((m) => m.id === id)?.displayName ?? "Member";

  const nets = computeBalances(
    members.map((m) => m.id),
    liveExpenses.map((e) => ({
      payerMemberId: e.expense.payerMemberId,
      shares: e.shares.map((s) => ({
        memberId: s.memberId,
        shareCents: decimalToCents(s.shareAmount),
      })),
    })),
    settlementRows.map((s) => ({
      fromMemberId: s.fromMemberId,
      toMemberId: s.toMemberId,
      amountCents: decimalToCents(s.amount),
    })),
  );

  const openDebts = computeSettlement(nets);

  return {
    version: { expenses: liveExpenses.length, settlements: settlementRows.length },
    currency,
    balances: nets.map((n) => ({
      name: nameOf(n.memberId),
      net: centsToDecimal(n.netCents),
    })),
    openDebts: openDebts.map((t) => ({
      from: nameOf(t.fromMemberId),
      to: nameOf(t.toMemberId),
      amount: centsToDecimal(t.amountCents),
    })),
    recentExpenses: liveExpenses.slice(0, RECENT).map((e) => ({
      desc: e.expense.description,
      amount: e.expense.amount,
      payer: nameOf(e.expense.payerMemberId),
    })),
    recentSettlements: settlementRows.slice(0, RECENT).map((s) => ({
      from: nameOf(s.fromMemberId),
      to: nameOf(s.toMemberId),
      amount: s.amount,
    })),
    updatedAt: new Date().toISOString(),
  };
}

/** Recompute and persist the summary. Returns it. */
export async function refreshGroupSummary(
  db: Db,
  groupId: string,
): Promise<AiSummary | null> {
  const group = await getGroupById(db, groupId);
  if (!group) return null;
  const summary = await computeGroupSummary(db, groupId, group.defaultCurrency);
  await mergeGroupSettings(db, groupId, { aiSummary: summary });
  return summary;
}

/** Best-effort refresh for write paths — never throws into the caller. */
export async function refreshGroupSummarySafe(
  db: Db,
  groupId: string,
): Promise<void> {
  try {
    await refreshGroupSummary(db, groupId);
  } catch (err) {
    console.error(
      `[summary] refresh failed for ${groupId}:`,
      err instanceof Error ? err.message : err,
    );
  }
}

/** Read the stored summary, if present and well-formed. */
export function readStoredSummary(settings: unknown): AiSummary | null {
  const s = (settings as { aiSummary?: AiSummary } | null)?.aiSummary;
  if (!s || !s.version || typeof s.version.expenses !== "number") return null;
  return s;
}

/**
 * Get a current summary for a scan: use the stored one if its stamp matches the
 * live counts, else recompute and persist (self-heal). Read-only when in sync.
 */
export async function getSummaryForScan(
  db: Db,
  groupId: string,
  settings: unknown,
  liveExpenseCount: number,
  settlementCount: number,
): Promise<AiSummary | null> {
  const stored = readStoredSummary(settings);
  if (
    stored &&
    stored.version.expenses === liveExpenseCount &&
    stored.version.settlements === settlementCount
  ) {
    return stored;
  }
  return refreshGroupSummary(db, groupId);
}
