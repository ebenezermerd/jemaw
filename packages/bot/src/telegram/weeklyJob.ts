/**
 * Weekly digest job. A single in-process scheduler (the Cloud Run service
 * runs with min instances 1) sweeps all groups hourly and posts the digest to
 * any group whose last digest is at least a week old. Groups with no activity
 * in the window are skipped silently but still re-stamped so quiet groups are
 * not spammed. `/digest` triggers the same send on demand.
 */
import type { Api } from "grammy";
import type { Db } from "../db.js";
import type { Group } from "@jemaw/shared/schema";
import {
  listAllGroups,
  listMembers,
  listLiveExpenses,
  listSettlements,
  listSettlementAllocations,
  mergeGroupSettings,
} from "../repo.js";
import { computeBalances } from "../domain/balances.js";
import {
  deriveExpenseDebts,
  computePairwiseTransfers,
  type ExpenseForDebt,
  type AllocationForDebt,
} from "../domain/pairwiseDebt.js";
import {
  computeWeeklyKpis,
  formatWeeklyDigest,
} from "../domain/weeklyDigest.js";
import { generateWeeklyNarrative } from "../ai/digestNarrative.js";
import type { ScanClient } from "../ai/geminiClient.js";
import { decimalToCents } from "@jemaw/shared/types";

export interface WeeklyJobDeps {
  db: Db;
  api: Api;
  gemini?: ScanClient;
}

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
const SWEEP_INTERVAL_MS = 60 * 60 * 1000; // hourly

/** Compose and post one group's digest. Returns "quiet" when there was nothing to say. */
export async function sendWeeklyDigest(
  deps: WeeklyJobDeps,
  group: Group,
): Promise<"sent" | "quiet"> {
  const { db } = deps;
  const members = await listMembers(db, group.id);
  const liveExpenses = await listLiveExpenses(db, group.id);
  const settlements = await listSettlements(db, group.id);
  const rawAllocations = await listSettlementAllocations(db, group.id);
  const nameOf = (id: string) =>
    members.find((m) => m.id === id)?.displayName ?? "Member";

  const since = new Date(Date.now() - WEEK_MS);
  const kpis = computeWeeklyKpis(
    liveExpenses.map((e) => ({
      payerMemberId: e.expense.payerMemberId,
      amountCents: decimalToCents(e.expense.amount),
      occurredAt: e.expense.occurredAt,
    })),
    settlements.map((s) => ({
      amountCents: decimalToCents(s.amount),
      when: s.markedPaidAt ?? s.createdAt,
    })),
    nameOf,
    since,
  );
  if (kpis.expenseCount === 0 && kpis.settlementCount === 0) return "quiet";

  const nets = computeBalances(
    members.map((m) => m.id),
    liveExpenses.map((e) => ({
      payerMemberId: e.expense.payerMemberId,
      shares: e.shares.map((s) => ({
        memberId: s.memberId,
        shareCents: decimalToCents(s.shareAmount),
      })),
    })),
    settlements.map((s) => ({
      fromMemberId: s.fromMemberId,
      toMemberId: s.toMemberId,
      amountCents: decimalToCents(s.amount),
    })),
  );
  const standings = nets.map((n) => ({
    name: nameOf(n.memberId),
    netCents: n.netCents,
  }));

  const expensesForDebt: ExpenseForDebt[] = liveExpenses.map((e) => ({
    expenseId: e.expense.id,
    payerMemberId: e.expense.payerMemberId,
    occurredAt: e.expense.occurredAt,
    shares: e.shares.map((s) => ({
      memberId: s.memberId,
      shareCents: decimalToCents(s.shareAmount),
    })),
  }));
  const allocations: AllocationForDebt[] = rawAllocations.map((a) => ({
    expenseId: a.expenseId,
    memberId: a.memberId,
    allocatedCents: decimalToCents(a.allocatedAmount),
  }));
  const openDebts = computePairwiseTransfers(
    deriveExpenseDebts(expensesForDebt, allocations),
  ).map((t) => ({
    fromName: nameOf(t.fromMemberId),
    toName: nameOf(t.toMemberId),
    amountCents: t.amountCents,
  }));

  const narrative = await generateWeeklyNarrative(deps.gemini, {
    currency: group.defaultCurrency,
    kpis,
    standings,
    openDebts,
  });

  const html = formatWeeklyDigest({
    groupName: group.name,
    currency: group.defaultCurrency,
    kpis,
    standings,
    openDebts,
    narrative,
  });
  await deps.api.sendMessage(Number(group.telegramChatId), html, {
    parse_mode: "HTML",
  });
  return "sent";
}

async function stampDigest(db: Db, groupId: string): Promise<void> {
  await mergeGroupSettings(db, groupId, {
    weeklyDigest: { lastSentAt: new Date().toISOString() },
  });
}

function lastSentAt(group: Group): number | null {
  const settings = group.settings as {
    weeklyDigest?: { lastSentAt?: string };
  };
  const raw = settings.weeklyDigest?.lastSentAt;
  if (!raw) return null;
  const parsed = Date.parse(raw);
  return Number.isNaN(parsed) ? null : parsed;
}

/** One sweep over all groups; exported for tests and the /digest command. */
export async function runWeeklyDigestSweep(deps: WeeklyJobDeps): Promise<void> {
  const groups = await listAllGroups(deps.db);
  for (const group of groups) {
    try {
      const last = lastSentAt(group);
      if (last === null) {
        // First sight of this group: start its weekly clock without posting,
        // so a fresh deploy never blasts every group at once.
        await stampDigest(deps.db, group.id);
        continue;
      }
      if (Date.now() - last < WEEK_MS) continue;
      const result = await sendWeeklyDigest(deps, group);
      await stampDigest(deps.db, group.id);
      console.log(`[digest] group ${group.id}: ${result}`);
    } catch (err) {
      console.warn(
        `[digest] group ${group.id} failed: ${err instanceof Error ? err.message : err}`,
      );
    }
  }
}

/** Start the hourly sweep. Returns a stop function. */
export function startWeeklyDigestScheduler(deps: WeeklyJobDeps): () => void {
  const timer = setInterval(() => {
    void runWeeklyDigestSweep(deps);
  }, SWEEP_INTERVAL_MS);
  // Unref so the timer never keeps a dying process alive.
  timer.unref?.();
  return () => clearInterval(timer);
}

/** Manual `/digest` trigger: send now and restart the weekly clock. */
export async function sendDigestNow(
  deps: WeeklyJobDeps,
  group: Group,
): Promise<"sent" | "quiet"> {
  const result = await sendWeeklyDigest(deps, group);
  await stampDigest(deps.db, group.id);
  return result;
}
