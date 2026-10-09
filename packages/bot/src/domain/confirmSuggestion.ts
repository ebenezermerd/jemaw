/**
 * Approve a draft (pending suggestion) into the ledger: a settlement draft is
 * recorded against its expenses, an expense or loan draft becomes an expense.
 * Shared by the mini app API and chat actions.
 */
import type { Db } from "../db.js";
import type { Group, Settlement, Suggestion } from "@jemaw/shared/schema";
import { centsToDecimal, decimalToCents } from "@jemaw/shared/types";
import { createExpenseWithShares, resolveSuggestion } from "../repo.js";
import { computeSplit } from "./splits.js";
import { recordSettlement, type SettlementAnnouncer } from "./recordSettlement.js";

type CreatedExpense = Awaited<ReturnType<typeof createExpenseWithShares>>;

export type ConfirmResult =
  | { settlement: Settlement }
  | { expense: CreatedExpense }
  | { error: string; status: number; extra?: Record<string, unknown> };

export async function confirmSuggestion(
  db: Db,
  group: Group,
  actorMemberId: string,
  s: Suggestion,
  opts: { amount?: string; botApi?: SettlementAnnouncer } = {},
): Promise<ConfirmResult> {
  if (s.status !== "pending") return { error: "already resolved", status: 409 };

  // ── settlement suggestion → record via allocation-based create ──
  if (s.kind === "settlement") {
    if (!s.fromMemberId || !s.toMemberId) {
      return { error: "settlement is missing parties", status: 400 };
    }
    if (!s.amount) {
      return { error: "amount required for this settlement; edit it", status: 400 };
    }
    // Suggestions need expenseIds to allocate. If none attached (e.g. AI
    // didn't match any expense yet), require the user to open the form.
    const expenseIds = (s.expenseIds as string[] | null) ?? [];
    if (expenseIds.length === 0) {
      return { error: "select the expenses this settlement covers — open the form to edit", status: 400 };
    }
    const result = await recordSettlement(
      db,
      group,
      actorMemberId,
      { fromMemberId: s.fromMemberId, toMemberId: s.toMemberId, amount: opts.amount ?? s.amount, expenseIds },
      { botApi: opts.botApi },
    );
    if ("error" in result) return { error: result.error, status: result.status ?? 409, extra: result.extra };
    await resolveSuggestion(db, s.id, "confirmed", actorMemberId, new Date());
    return { settlement: result.settlement };
  }

  // ── expense or loan suggestion → create a ledger entry ──
  if (!s.payerMemberId) return { error: "suggestion has no payer; edit it", status: 400 };
  if (!s.amount) return { error: "suggestion has no amount; edit it", status: 400 };

  const splitWith = (s.splitWith as string[]) ?? [];
  const totalCents = decimalToCents(s.amount);
  let shares: { memberId: string; shareAmount: string }[];
  try {
    if (s.kind === "loan") {
      if (splitWith.length !== 1 || splitWith[0] === s.payerMemberId) {
        return { error: "loan suggestion has invalid parties", status: 400 };
      }
      shares = [{ memberId: splitWith[0]!, shareAmount: centsToDecimal(totalCents) }];
    } else {
      const computed = computeSplit({
        totalCents,
        splitType: s.splitType,
        memberIds: splitWith,
        shares: (s.shares as Record<string, number> | null) ?? undefined,
      });
      shares = computed.map((c) => ({ memberId: c.memberId, shareAmount: centsToDecimal(c.shareCents) }));
    }
  } catch (err) {
    return { error: err instanceof Error ? err.message : "bad split", status: 400 };
  }

  const expense = await createExpenseWithShares(
    db,
    {
      groupId: group.id,
      payerMemberId: s.payerMemberId,
      amount: centsToDecimal(totalCents),
      kind: s.kind,
      currency: group.defaultCurrency,
      description: s.description,
      createdByMemberId: actorMemberId,
      source: "ai_confirmed",
      sourceSuggestionId: s.id,
      occurredAt: new Date(),
    },
    shares,
  );
  await resolveSuggestion(db, s.id, "confirmed", actorMemberId, new Date());
  return { expense };
}
