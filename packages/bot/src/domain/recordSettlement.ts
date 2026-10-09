/**
 * Record a settlement against selected expenses: the one write path for a
 * payment, used by the mini app API and by chat actions. Allocates the
 * amount across the selected expenses oldest first, nets counter debts, and
 * optionally announces it in the group.
 */
import type { Db } from "../db.js";
import type { Group, Settlement } from "@jemaw/shared/schema";
import { centsToDecimal, decimalToCents } from "@jemaw/shared/types";
import {
  createSettlementWithAllocations,
  listLiveExpenses,
  type AllocationInput,
} from "../repo.js";
import { COVERAGE_TOLERANCE_CENTS } from "./pairwiseDebt.js";
import { loadLedger } from "./ledger.js";
import { formatSettlementAnnouncement } from "../telegram/announcements.js";
import { toTransferDto } from "../api/mappers.js";

export interface SettlementInput {
  toMemberId: string;
  /** Defaults to the actor. */
  fromMemberId?: string;
  /** Defaults to everything owed on the selected expenses, net of counter debts. */
  amount?: string;
  method?: "cash" | "bank" | "telebirr" | "other";
  description?: string;
  expenseIds: string[];
  occurredAt?: string;
}

/** The slice of the grammY Api the announcement needs. */
export interface SettlementAnnouncer {
  sendMessage(chatId: number, text: string, opts: { parse_mode: "HTML" }): Promise<unknown>;
}

export async function recordSettlement(
  db: Db,
  group: Group,
  /** Who recorded it: the app user, or the super admin confirming in chat. */
  actorMemberId: string,
  input: SettlementInput,
  opts: { botApi?: SettlementAnnouncer } = {},
): Promise<
  | { settlement: Settlement }
  | { error: string; status?: number; extra?: Record<string, unknown> }
> {
  const fromMemberId = input.fromMemberId ?? actorMemberId;
  const { toMemberId, expenseIds } = input;

  const { members, expensesForDebt, allocations, transfers } = await loadLedger(db, group.id);

  const hasDebt = transfers.some(
    (t) => t.fromMemberId === fromMemberId && t.toMemberId === toMemberId,
  );
  if (!hasDebt) {
    return {
      error: "no current debt between these members",
      status: 409,
      extra: { transfers: transfers.map(toTransferDto) },
    };
  }

  const liveExpenses = await listLiveExpenses(db, group.id);
  const expensesForDebtMap = new Map(expensesForDebt.map((e) => [e.expenseId, e]));

  // Residual the from member still owes on an expense (share minus allocations).
  const residualFor = (expenseId: string): number => {
    const efd = expensesForDebtMap.get(expenseId);
    const share = efd?.shares.find((s) => s.memberId === fromMemberId);
    if (!share) return 0;
    const allocated = allocations
      .filter((a) => a.expenseId === expenseId && a.memberId === fromMemberId)
      .reduce((sum, a) => sum + a.allocatedCents, 0);
    return Math.max(0, share.shareCents - allocated);
  };

  const namedExpenses = expenseIds
    .map((id) => liveExpenses.find((e) => e.expense.id === id))
    .filter((e): e is NonNullable<typeof e> => e !== undefined);

  // Validate the named expenses first, so genuine mistakes (wrong payer, no
  // share) surface a precise error before we drop any already-settled ones.
  for (const e of namedExpenses) {
    if (e.expense.payerMemberId !== toMemberId) {
      return {
        error: `expense "${e.expense.description}" was not paid by the payee`,
        status: 409,
      };
    }
    if (!e.shares.some((s) => s.memberId === fromMemberId)) {
      return {
        error: `you have no share in "${e.expense.description}"`,
        status: 409,
      };
    }
  }

  // Drop expenses the from member has already settled (residual within
  // tolerance). A stale suggestion may still carry them; recording would
  // either over-pay or re-touch a cleared share.
  const selectedExpenses = namedExpenses.filter(
    (e) => residualFor(e.expense.id) > COVERAGE_TOLERANCE_CENTS,
  );

  // After dropping settled entries, nothing remains to record.
  if (selectedExpenses.length === 0) {
    return {
      error: "these expenses are already settled",
      status: 409,
    };
  }

  let maxAllocatableCents = 0;
  for (const e of selectedExpenses) {
    const efd = expensesForDebtMap.get(e.expense.id);
    if (!efd) continue;
    const share = efd.shares.find((s) => s.memberId === fromMemberId);
    if (!share) continue;
    const allocated = allocations
      .filter((a) => a.expenseId === e.expense.id && a.memberId === fromMemberId)
      .reduce((sum, a) => sum + a.allocatedCents, 0);
    maxAllocatableCents += Math.max(0, share.shareCents - allocated);
  }

  // Reverse debts (to → from) available to net against this payment. The
  // settle plan shows the NETTED pair amount, so paying it must also retire
  // the counter debts — otherwise both directions dangle as uncovered
  // leftovers the plan can never surface again.
  const counterDebts: { expenseId: string; residual: number; occurredAt: Date }[] = [];
  for (const e of expensesForDebt) {
    if (e.payerMemberId !== fromMemberId) continue;
    const share = e.shares.find((s) => s.memberId === toMemberId);
    if (!share) continue;
    const allocated = allocations
      .filter((a) => a.expenseId === e.expenseId && a.memberId === toMemberId)
      .reduce((sum, a) => sum + a.allocatedCents, 0);
    const residual = share.shareCents - allocated;
    if (residual > 0) {
      counterDebts.push({ expenseId: e.expenseId, residual, occurredAt: e.occurredAt });
    }
  }
  counterDebts.sort((a, b) => a.occurredAt.getTime() - b.occurredAt.getTime());
  const counterTotalCents = counterDebts.reduce((s, d) => s + d.residual, 0);

  const requestedCents = input.amount
    ? decimalToCents(input.amount)
    : Math.max(0, maxAllocatableCents - counterTotalCents);

  if (requestedCents > maxAllocatableCents + COVERAGE_TOLERANCE_CENTS) {
    return {
      error: "amount exceeds what you owe on the selected expenses",
      status: 409,
      extra: { maxAllocatable: centsToDecimal(maxAllocatableCents) },
    };
  }
  const paidCents = Math.min(requestedCents, maxAllocatableCents);
  // Offset: the slice of the selected shares settled by what `to` owes
  // `from` rather than by cash.
  const offsetCents = Math.min(
    counterTotalCents,
    Math.max(0, maxAllocatableCents - paidCents),
  );

  // "Leave it": when cash plus offset falls just short of the full owed
  // amount by a sub-tolerance remainder (e.g. rounding cents), treat the
  // selected expenses as fully covered and allocate each one's full residual.
  // The recorded settlement amount still reflects what was actually paid.
  const coversInFull =
    maxAllocatableCents - (requestedCents + offsetCents) <=
    COVERAGE_TOLERANCE_CENTS;

  const sortedExpenses = [...selectedExpenses].sort(
    (a, b) => a.expense.occurredAt.getTime() - b.expense.occurredAt.getTime(),
  );
  const allocationInputs: AllocationInput[] = [];
  let remaining = paidCents + offsetCents;
  let allocatedOnSelected = 0;
  for (const e of sortedExpenses) {
    if (!coversInFull && remaining <= 0) break;
    const efd = expensesForDebtMap.get(e.expense.id);
    const share = efd?.shares.find((s) => s.memberId === fromMemberId);
    if (!share) continue;
    const allocated = allocations
      .filter((a) => a.expenseId === e.expense.id && a.memberId === fromMemberId)
      .reduce((sum, a) => sum + a.allocatedCents, 0);
    const residual = Math.max(0, share.shareCents - allocated);
    const give = coversInFull ? residual : Math.min(remaining, residual);
    if (give > 0) {
      allocationInputs.push({
        expenseId: e.expense.id,
        memberId: fromMemberId,
        allocatedAmount: centsToDecimal(give),
      });
      remaining -= give;
      allocatedOnSelected += give;
    }
  }

  // Retire the counter debts consumed by the offset (the netted slice), so
  // both directions close together. Sub-tolerance leftovers complete fully.
  let offsetToConsume = Math.max(0, allocatedOnSelected - paidCents);
  if (
    offsetToConsume > 0 &&
    counterTotalCents - offsetToConsume <= COVERAGE_TOLERANCE_CENTS
  ) {
    offsetToConsume = counterTotalCents;
  }
  for (const d of counterDebts) {
    if (offsetToConsume <= 0) break;
    const give = Math.min(offsetToConsume, d.residual);
    allocationInputs.push({
      expenseId: d.expenseId,
      memberId: toMemberId,
      allocatedAmount: centsToDecimal(give),
    });
    offsetToConsume -= give;
  }

  const { settlement } = await createSettlementWithAllocations(
    db,
    {
      groupId: group.id,
      fromMemberId,
      toMemberId,
      amount: centsToDecimal(paidCents),
      currency: group.defaultCurrency,
      method: input.method ?? "cash",
      description: input.description ?? null,
      occurredAt: input.occurredAt ? new Date(input.occurredAt) : new Date(),
      markedPaidAt: new Date(),
      markedPaidByMemberId: actorMemberId,
    },
    allocationInputs,
  );

  // Announce in the group chat (best effort) so settles recorded in the app
  // are visible without opening it.
  if (opts.botApi) {
    const nameOf = (id: string) =>
      members.find((m) => m.id === id)?.displayName ?? "Member";
    // The plan's pair amount is already netted, so cash paid is what moves
    // it; offset allocations retire equal debt on both sides and cancel out.
    const pairOwed =
      transfers.find(
        (t) => t.fromMemberId === fromMemberId && t.toMemberId === toMemberId,
      )?.amountCents ?? 0;
    const remainingCents = pairOwed - paidCents;
    const html = formatSettlementAnnouncement({
      fromName: nameOf(fromMemberId),
      toName: nameOf(toMemberId),
      amount: centsToDecimal(paidCents),
      currency: group.defaultCurrency,
      method: input.method ?? "cash",
      expenseDescriptions: sortedExpenses.map((e) => e.expense.description),
      remaining:
        remainingCents > COVERAGE_TOLERANCE_CENTS
          ? centsToDecimal(remainingCents)
          : null,
    });
    void opts.botApi
      .sendMessage(Number(group.telegramChatId), html, { parse_mode: "HTML" })
      .catch((err: unknown) =>
        console.warn(
          `[announce] settlement message failed: ${err instanceof Error ? err.message : err}`,
        ),
      );
  }

  return { settlement };
}
