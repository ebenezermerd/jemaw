/**
 * Phase 1 REST API. All routes live under /api/groups/:groupId and run behind
 * the initData auth hook. Bodies validated with zod.
 */
import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { z } from "zod";
import type { Db } from "../db.js";
import { makeAuthHook, type AuthDeps } from "../auth/authHook.js";
import { verifyInitData } from "../auth/initData.js";
import {
  listGroupsForTelegramUser,
  listMembers,
  listLiveExpenses,
  createExpenseWithShares,
  updateExpenseWithShares,
  voidExpense,
  getExpense,
  groupHasExpenses,
  groupHasNewMessages,
  listSettlements,
  getSettlement,
  createSettlementWithAllocations,
  deleteSettlement,
  listSettlementAllocations,
  listPendingSuggestions,
  getSuggestion,
  resolveSuggestion,
  addManualMember,
  renameMember,
  setMemberRoleById,
  setMemberPrimaryById,
  assignMemberTelegram,
  listMessageSenderIds,
  removeMemberById,
  countAdmins,
  updateGroupCurrency,
  resetGroupData,
  getGroupById,
  mergeGroupSettings,
  type AllocationInput,
} from "../repo.js";
import { computeSplit } from "../domain/splits.js";
import {
  computeBalances,
  type ExpenseForBalance,
  type MemberNet,
} from "../domain/balances.js";
import {
  deriveExpenseDebts,
  isExpenseCovered,
  computePairwiseTransfers,
  COVERAGE_TOLERANCE_CENTS,
  type ExpenseForDebt,
  type AllocationForDebt,
} from "../domain/pairwiseDebt.js";
import { refreshGroupSummarySafe } from "../ai/summary.js";
import {
  decimalToCents,
  centsToDecimal,
  type BootstrapResponse,
  type HistoryResponse,
  type HistoryItem,
  type SettlePlanResponse,
  type ExpenseDto,
} from "@jemaw/shared/types";
import type { Transfer } from "../domain/settle.js";
import type { Group, Member, Settlement } from "@jemaw/shared/schema";
import { formatSettlementAnnouncement } from "../telegram/announcements.js";
import {
  toGroupDto,
  toExpenseDto,
  toBalanceDtos,
  toMemberDto,
  toTransferDto,
  toSettlementDto,
  toSuggestionDto,
} from "./mappers.js";
import type {
  SuggestionsResponse,
  MeSummaryDto,
  TelegramCandidateDto,
  TelegramCandidatesResponse,
  MemberDataSummaryDto,
  MemberExpenseItemDto,
  MemberSettlementItemDto,
  RemoveMemberResponse,
} from "@jemaw/shared/types";
import type { ScanRateLimiter } from "../ai/rateLimit.js";

/**
 * Load the full ledger for a group: net balances (for Balances screen),
 * per-creditor pairwise transfers (for the Settle plan), coverage set, and
 * the raw data needed by settlement-create validation.
 *
 * nets   — computed from ALL live expenses + ALL settlements (zero-sum invariant).
 * transfers — per-creditor pairwise plan from expense_shares minus allocations.
 * coveredExpenseIds — expenses where every debtor share is within tolerance.
 */
async function loadLedger(
  db: Db,
  groupId: string,
): Promise<{
  members: Member[];
  nets: MemberNet[];
  expensesForDebt: ExpenseForDebt[];
  allocations: AllocationForDebt[];
  coveredExpenseIds: Set<string>;
  transfers: Transfer[];
}> {
  const members = await listMembers(db, groupId);
  const liveExpenses = await listLiveExpenses(db, groupId);
  const settlements = await listSettlements(db, groupId);
  const rawAllocations = await listSettlementAllocations(db, groupId);

  // Net balances (unchanged from before — keeps zero-sum invariant).
  const forBalance: ExpenseForBalance[] = liveExpenses.map((e) => ({
    payerMemberId: e.expense.payerMemberId,
    shares: e.shares.map((s) => ({
      memberId: s.memberId,
      shareCents: decimalToCents(s.shareAmount),
    })),
  }));
  const forSettle = settlements.map((s) => ({
    fromMemberId: s.fromMemberId,
    toMemberId: s.toMemberId,
    amountCents: decimalToCents(s.amount),
  }));
  const nets = computeBalances(
    members.map((m) => m.id),
    forBalance,
    forSettle,
  );

  // Per-creditor pairwise debt (new — drives Settle plan + coverage).
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

  const coveredExpenseIds = new Set(
    expensesForDebt
      .filter((e) => isExpenseCovered(e, allocations))
      .map((e) => e.expenseId),
  );

  const pairDebts = deriveExpenseDebts(expensesForDebt, allocations);
  const transfers = computePairwiseTransfers(pairDebts);

  return { members, nets, expensesForDebt, allocations, coveredExpenseIds, transfers };
}

/**
 * Annotate each share with how much is already settled (allocatedAmount) and
 * what remains owed (remainingOwed), so the client can hide shares a member has
 * already cleared without re-deriving allocation math.
 */
function enrichExpenseShares(
  dto: ExpenseDto,
  allocations: AllocationForDebt[],
): ExpenseDto {
  return {
    ...dto,
    shares: dto.shares.map((s) => {
      const allocatedCents = allocations
        .filter((a) => a.expenseId === dto.id && a.memberId === s.memberId)
        .reduce((sum, a) => sum + a.allocatedCents, 0);
      const remainingCents = Math.max(0, decimalToCents(s.shareAmount) - allocatedCents);
      return {
        ...s,
        allocatedAmount: centsToDecimal(allocatedCents),
        remainingOwed: centsToDecimal(remainingCents),
      };
    }),
  };
}

/** Validated expense input shape (shared by create + edit). */
type ExpenseInput = z.infer<typeof createExpenseSchema>;

/**
 * Validate members + compute share rows for an expense. Returns either the
 * decimal-string share rows, or an error string for a 400 response.
 */
function buildShareRows(
  input: ExpenseInput,
  memberIds: Set<string>,
): { shares: { memberId: string; shareAmount: string }[] } | { error: string } {
  if (!memberIds.has(input.payerMemberId)) return { error: "payer not in group" };
  const totalCents = decimalToCents(input.amount);
  if (input.kind === "loan") {
    if (input.splitWith.length !== 1) {
      return { error: "loan must have one borrower" };
    }
    const borrower = input.splitWith[0]!;
    if (!memberIds.has(borrower)) return { error: `member ${borrower} not in group` };
    if (borrower === input.payerMemberId) {
      return { error: "lender and borrower must differ" };
    }
    return {
      shares: [{ memberId: borrower, shareAmount: centsToDecimal(totalCents) }],
    };
  }
  for (const id of input.splitWith) {
    if (!memberIds.has(id)) return { error: `member ${id} not in group` };
  }
  try {
    const computed = computeSplit({
      totalCents,
      splitType: input.splitType,
      memberIds: input.splitWith,
      shares: input.shares,
      exactCents: input.exact
        ? Object.fromEntries(
            Object.entries(input.exact).map(([k, v]) => [k, decimalToCents(v)]),
          )
        : undefined,
    });
    return {
      shares: computed.map((c) => ({
        memberId: c.memberId,
        shareAmount: centsToDecimal(c.shareCents),
      })),
    };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "bad split" };
  }
}

const createExpenseSchema = z.object({
  kind: z.enum(["expense", "loan"]).optional().default("expense"),
  description: z.string().min(1).max(200),
  amount: z.string().regex(/^\d+(\.\d{1,2})?$/),
  payerMemberId: z.string().uuid(),
  splitType: z.enum(["equal", "shares", "exact"]),
  splitWith: z.array(z.string().uuid()).min(1),
  shares: z.record(z.string(), z.number().int().positive()).optional(),
  exact: z.record(z.string(), z.string().regex(/^\d+(\.\d{1,2})?$/)).optional(),
  occurredAt: z.string().datetime().optional(),
});

const createSettlementSchema = z.object({
  toMemberId: z.string().uuid(),
  fromMemberId: z.string().uuid().optional(),
  amount: z.string().regex(/^\d+(\.\d{1,2})?$/).optional(),
  method: z.enum(["cash", "bank", "telebirr", "other"]).optional(),
  description: z.string().max(200).optional(),
  expenseIds: z.array(z.string().uuid()).min(1, "select at least one expense"),
  occurredAt: z.string().datetime().optional(),
});

const updateGroupSchema = z.object({
  defaultCurrency: z.string().length(3).optional(),
});

const addMemberSchema = z.object({
  displayName: z.string().min(1).max(80),
  telegramUserId: z.string().optional(),
});

const renameSchema = z.object({ displayName: z.string().min(1).max(80) });
const setRoleSchema = z.object({ role: z.enum(["admin", "member"]) });
const setPrimarySchema = z.object({ isPrimary: z.boolean() });
const assignTelegramSchema = z.object({
  telegramUserId: z.string().regex(/^\d+$/).nullable(),
  username: z.string().min(1).max(80).nullable().optional(),
});

export interface ApiDeps {
  db: Db;
  botToken: string;
  now: () => number;
  /** Present when GEMINI_API_KEY is set — enables the manual re-scan endpoint. */
  gemini?: import("../ai/geminiClient.js").GeminiClient;
  scanLimiter: ScanRateLimiter;
  /** The bot Api, so app-triggered scans can badge the source messages. */
  botApi?: import("grammy").Api;
  /** Phase 1–2 humor runtime (optional). */
  humor?: import("../ai/humor/deliver.js").HumorRuntime;
}

export async function registerApi(
  app: FastifyInstance,
  deps: ApiDeps,
): Promise<void> {
  const { db } = deps;
  const authDeps: AuthDeps = {
    db,
    botToken: deps.botToken,
    now: deps.now,
  };
  const auth = makeAuthHook(authDeps);

  app.get("/api/bootstrap", async (req, reply): Promise<BootstrapResponse | void> => {
    const initData = req.headers["x-telegram-init-data"];
    if (typeof initData !== "string" || initData.length === 0) {
      await reply.code(401).send({ error: "missing initData" });
      return;
    }

    const verified = verifyInitData(initData, deps.botToken, deps.now());
    if (!verified.ok || !verified.data) {
      await reply.code(401).send({ error: `auth: ${verified.reason}` });
      return;
    }

    const userGroups = await listGroupsForTelegramUser(
      db,
      verified.data.user.id,
    );
    return {
      groups: userGroups.map((group) => ({ id: group.id, name: group.name })),
    };
  });

  // Admin guard: returns true if the caller is a group admin, else sends 403.
  // Relies on req.jemaw.member.role, which the auth hook resolves from verified
  // initData — the client cannot forge it.
  function requireAdmin(req: FastifyRequest, reply: FastifyReply): boolean {
    if (req.jemaw!.member.role === "admin") return true;
    reply.code(403).send({ error: "admin only" });
    return false;
  }

  // GET group meta + members
  app.get(
    "/api/groups/:groupId",
    { preHandler: auth },
    async (req) => {
      const { group, member } = req.jemaw!;
      const members = await listMembers(db, group.id);
      const hasExpenses = await groupHasExpenses(db, group.id);
      const canScan = deps.gemini
        ? await groupHasNewMessages(db, group.id)
        : false;
      return toGroupDto(group, members, hasExpenses, canScan, member);
    },
  );

  // PATCH group settings (currency) — admin only; blocked once expenses exist.
  app.patch(
    "/api/groups/:groupId",
    { preHandler: auth },
    async (req, reply) => {
      if (!requireAdmin(req, reply)) return;
      const { group, member } = req.jemaw!;
      const parsed = updateGroupSchema.safeParse(req.body);
      if (!parsed.success) return reply.code(400).send({ error: "invalid body" });
      if (parsed.data.defaultCurrency) {
        if (await groupHasExpenses(db, group.id)) {
          return reply
            .code(409)
            .send({ error: "currency is locked — expenses exist" });
        }
        const updated = await updateGroupCurrency(
          db,
          group.id,
          parsed.data.defaultCurrency.toUpperCase(),
        );
        if (!updated) return reply.code(404).send({ error: "group not found" });
        const members = await listMembers(db, group.id);
        return toGroupDto(updated, members, false, false, member);
      }
      const members = await listMembers(db, group.id);
      const hasExpenses = await groupHasExpenses(db, group.id);
      const canScan = deps.gemini
        ? await groupHasNewMessages(db, group.id)
        : false;
      return toGroupDto(group, members, hasExpenses, canScan, member);
    },
  );

  // POST reset — admin only. Clears this group's ledger (expenses, shares,
  // settlements, suggestions, messages, ai_runs); keeps the group and members.
  app.post(
    "/api/groups/:groupId/reset",
    { preHandler: auth },
    async (req, reply) => {
      if (!requireAdmin(req, reply)) return;
      const { group, member } = req.jemaw!;
      await resetGroupData(db, group.id);
      await refreshGroupSummarySafe(db, group.id); // empty ledger → empty summary
      const members = await listMembers(db, group.id);
      return toGroupDto(group, members, false, false, member);
    },
  );

  // GET the calling member's personal summary (Home card).
  app.get(
    "/api/groups/:groupId/me/summary",
    { preHandler: auth },
    async (req) => {
      const { group, member } = req.jemaw!;
      const { nets } = await loadLedger(db, group.id);
      const net = nets.find((n) => n.memberId === member.id)?.netCents ?? 0;

      const expenses = await listLiveExpenses(db, group.id);
      let paidCents = 0;
      let shareCents = 0;
      let count = 0;
      for (const e of expenses) {
        const isPayer = e.expense.payerMemberId === member.id;
        const myShare = e.shares.find((s) => s.memberId === member.id);
        if (isPayer) paidCents += decimalToCents(e.expense.amount);
        if (myShare) shareCents += decimalToCents(myShare.shareAmount);
        if (isPayer || myShare) count += 1;
      }

      const res: MeSummaryDto = {
        memberId: member.id,
        displayName: member.displayName,
        net: centsToDecimal(net),
        totalPaid: centsToDecimal(paidCents),
        totalShare: centsToDecimal(shareCents),
        expenseCount: count,
        currency: group.defaultCurrency,
      };
      return res;
    },
  );

  // GET balances
  app.get(
    "/api/groups/:groupId/balances",
    { preHandler: auth },
    async (req) => {
      const { group } = req.jemaw!;
      const { members, nets } = await loadLedger(db, group.id);
      const nameOf = (id: string) =>
        members.find((m) => m.id === id)?.displayName ?? "Member";
      // Removed (inactive) members stay visible only while their net is
      // nonzero; once square they drop off the board.
      const inactive = new Set(
        members.filter((m) => !m.isActive).map((m) => m.id),
      );
      const visible = nets.filter(
        (n) => !inactive.has(n.memberId) || n.netCents !== 0,
      );
      return toBalanceDtos(visible, nameOf);
    },
  );

  // GET live settle-up plan (per-creditor pairwise, not global netting)
  app.get(
    "/api/groups/:groupId/settle",
    { preHandler: auth },
    async (req) => {
      const { group } = req.jemaw!;
      const { transfers } = await loadLedger(db, group.id);
      const res: SettlePlanResponse = { transfers: transfers.map(toTransferDto) };
      return res;
    },
  );

  // GET settlements list
  app.get(
    "/api/groups/:groupId/settlements",
    { preHandler: auth },
    async (req) => {
      const { group } = req.jemaw!;
      const settlements = await listSettlements(db, group.id);
      return settlements.map(toSettlementDto);
    },
  );

  // DELETE a recorded settlement. The payer, payee, marker, or an admin can remove it.
  app.delete(
    "/api/groups/:groupId/settlements/:settlementId",
    { preHandler: auth },
    async (req, reply) => {
      const { group, member } = req.jemaw!;
      const { settlementId } = req.params as { settlementId: string };
      const existing = await getSettlement(db, group.id, settlementId);
      if (!existing) return reply.code(404).send({ error: "not found" });
      const canRemove =
        member.role === "admin" ||
        existing.fromMemberId === member.id ||
        existing.toMemberId === member.id ||
        existing.markedPaidByMemberId === member.id;
      if (!canRemove) {
        return reply.code(403).send({ error: "only an involved member or admin can remove this" });
      }
      const result = await deleteSettlement(db, group.id, settlementId);
      if (result === "not_found") return reply.code(404).send({ error: "not found" });
      await refreshGroupSummarySafe(db, group.id);
      return reply.code(200).send({ ok: true });
    },
  );

  // POST record a settlement. Requires >=1 selected expense (expenseIds).
  // Amount is allocated across selected expenses oldest-first; over-paying is
  // rejected with the max-allocatable cap rather than silently clamped.
  app.post(
    "/api/groups/:groupId/settlements",
    { preHandler: auth },
    async (req, reply) => {
      const { group, member } = req.jemaw!;
      const parsed = createSettlementSchema.safeParse(req.body);
      if (!parsed.success) {
        return reply.code(400).send({ error: "invalid body" });
      }
      const result = await recordSettlementFromInput(group, member, parsed.data);
      if ("error" in result) {
        return reply.code(result.status ?? 409).send({ error: result.error, ...result.extra });
      }
      await refreshGroupSummarySafe(db, group.id);
      return reply.code(201).send(toSettlementDto(result.settlement));
    },
  );

  async function recordSettlementFromInput(
    group: Group,
    member: Member,
    input: z.infer<typeof createSettlementSchema>,
  ): Promise<
    | { settlement: Settlement }
    | { error: string; status?: number; extra?: Record<string, unknown> }
  > {
    const fromMemberId = input.fromMemberId ?? member.id;
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
        markedPaidByMemberId: member.id,
      },
      allocationInputs,
    );

    // Announce in the group chat (best effort) so settles recorded in the app
    // are visible without opening it.
    if (deps.botApi) {
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
      void deps.botApi
        .sendMessage(Number(group.telegramChatId), html, { parse_mode: "HTML" })
        .catch((err: unknown) =>
          console.warn(
            `[announce] settlement message failed: ${err instanceof Error ? err.message : err}`,
          ),
        );
    }

    return { settlement };
  }


  app.get(
    "/api/groups/:groupId/expenses",
    { preHandler: auth },
    async (req) => {
      const { group } = req.jemaw!;
      const { includeCovered, forMember } = req.query as {
        includeCovered?: string;
        forMember?: string;
      };
      const expenses = await listLiveExpenses(db, group.id);
      if (includeCovered === "1") return expenses.map(toExpenseDto);

      const { coveredExpenseIds, allocations } = await loadLedger(db, group.id);
      let live = expenses.filter((e) => !coveredExpenseIds.has(e.expense.id));

      // forMember: drop expenses where this member's own share is already
      // settled (allocated within tolerance), even if other debtors still owe.
      // Keeps a settler from re-seeing entries they've already cleared.
      if (forMember) {
        live = live.filter((e) => {
          const share = e.shares.find((s) => s.memberId === forMember);
          if (!share) return false;
          const allocated = allocations
            .filter((a) => a.expenseId === e.expense.id && a.memberId === forMember)
            .reduce((sum, a) => sum + a.allocatedCents, 0);
          return decimalToCents(share.shareAmount) - allocated > COVERAGE_TOLERANCE_CENTS;
        });
      }

      return live.map((e) => enrichExpenseShares(toExpenseDto(e), allocations));
    },
  );

  // GET one expense
  app.get(
    "/api/groups/:groupId/expenses/:expenseId",
    { preHandler: auth },
    async (req, reply) => {
      const { group } = req.jemaw!;
      const { expenseId } = req.params as { expenseId: string };
      const e = await getExpense(db, group.id, expenseId);
      if (!e) return reply.code(404).send({ error: "not found" });
      return toExpenseDto(e);
    },
  );

  // PATCH edit an expense (recompute shares). Allowed for the expense's creator
  // or a group admin; others get 403.
  app.patch(
    "/api/groups/:groupId/expenses/:expenseId",
    { preHandler: auth },
    async (req, reply) => {
      const { group, member } = req.jemaw!;
      const { expenseId } = req.params as { expenseId: string };
      const existing = await getExpense(db, group.id, expenseId);
      if (!existing) return reply.code(404).send({ error: "not found" });
      if (
        member.role !== "admin" &&
        existing.expense.createdByMemberId !== member.id
      ) {
        return reply.code(403).send({ error: "only the creator or an admin can edit this" });
      }
      const parsed = createExpenseSchema.safeParse(req.body);
      if (!parsed.success) {
        return reply.code(400).send({ error: "invalid body" });
      }
      const body = parsed.data;
      const members = await listMembers(db, group.id);
      const built = buildShareRows(body, new Set(members.map((m) => m.id)));
      if ("error" in built) return reply.code(400).send({ error: built.error });

      try {
        const updated = await updateExpenseWithShares(
          db,
          group.id,
          expenseId,
          {
            payerMemberId: body.payerMemberId,
            amount: centsToDecimal(decimalToCents(body.amount)),
            kind: body.kind,
            description: body.description,
            occurredAt: body.occurredAt ? new Date(body.occurredAt) : undefined,
          },
          built.shares,
        );
        if (!updated) return reply.code(404).send({ error: "not found" });
        await refreshGroupSummarySafe(db, group.id);
        return toExpenseDto(updated);
      } catch (err) {
        return reply.code(409).send({
          error: err instanceof Error ? err.message : "cannot edit",
        });
      }
    },
  );

  // POST void an expense (soft delete). Creator or admin only.
  app.post(
    "/api/groups/:groupId/expenses/:expenseId/void",
    { preHandler: auth },
    async (req, reply) => {
      const { group, member } = req.jemaw!;
      const { expenseId } = req.params as { expenseId: string };
      const existing = await getExpense(db, group.id, expenseId);
      if (!existing) return reply.code(404).send({ error: "not found" });
      if (
        member.role !== "admin" &&
        existing.expense.createdByMemberId !== member.id
      ) {
        return reply.code(403).send({ error: "only the creator or an admin can remove this" });
      }
      const result = await voidExpense(db, group.id, expenseId, new Date());
      if (result === "not_found") {
        return reply.code(404).send({ error: "not found" });
      }
      if (result === "already_voided") {
        return reply.code(409).send({ error: "already voided" });
      }
      await refreshGroupSummarySafe(db, group.id);
      return reply.code(200).send({ ok: true });
    },
  );

  // POST create expense
  app.post(
    "/api/groups/:groupId/expenses",
    { preHandler: auth },
    async (req, reply) => {
      const { group, member } = req.jemaw!;
      const parsed = createExpenseSchema.safeParse(req.body);
      if (!parsed.success) {
        return reply
          .code(400)
          .send({ error: "invalid body", issues: parsed.error.issues });
      }
      const body = parsed.data;

      const members = await listMembers(db, group.id);
      const built = buildShareRows(body, new Set(members.map((m) => m.id)));
      if ("error" in built) return reply.code(400).send({ error: built.error });
      const totalCents = decimalToCents(body.amount);

      const occurredAt = body.occurredAt
        ? new Date(body.occurredAt)
        : new Date();

      const created = await createExpenseWithShares(
        db,
        {
          groupId: group.id,
          payerMemberId: body.payerMemberId,
          amount: centsToDecimal(totalCents),
          kind: body.kind,
          currency: group.defaultCurrency,
          description: body.description,
          createdByMemberId: member.id,
          source: "manual",
          occurredAt,
        },
        built.shares,
      );

      await refreshGroupSummarySafe(db, group.id);
      return reply.code(201).send(toExpenseDto(created));
    },
  );

  // GET history (expenses + settlements, grouped by day). Covered items are
  // included (not hidden) but tagged with settled:true for the UI to render
  // a "settled" badge. Expenses fetched with includeCovered=1 implicitly.
  app.get(
    "/api/groups/:groupId/history",
    { preHandler: auth },
    async (req) => {
      const { group } = req.jemaw!;
      const { memberId } = req.query as { memberId?: string };

      const { coveredExpenseIds } = await loadLedger(db, group.id);

      let expenses = await listLiveExpenses(db, group.id); // includes covered
      let settlements = await listSettlements(db, group.id);
      if (memberId) {
        expenses = expenses.filter(
          (e) =>
            e.expense.payerMemberId === memberId ||
            e.shares.some((s) => s.memberId === memberId),
        );
        settlements = settlements.filter(
          (s) => s.fromMemberId === memberId || s.toMemberId === memberId,
        );
      }

      // Each item carries its day + a sort timestamp.
      const entries: { day: string; ts: number; item: HistoryItem }[] = [];
      for (const e of expenses) {
        const settled = coveredExpenseIds.has(e.expense.id);
        entries.push({
          day: e.expense.occurredAt.toISOString().slice(0, 10),
          ts: e.expense.occurredAt.getTime(),
          item: { kind: "expense", expense: toExpenseDto(e), settled },
        });
      }
      for (const s of settlements) {
        const when = s.markedPaidAt ?? s.createdAt;
        // A settlement is "settled" when all expenses it covers are covered.
        const expIds = (s.expenseIds as string[] | null) ?? [];
        const settled = expIds.length > 0 && expIds.every((id) => coveredExpenseIds.has(id));
        entries.push({
          day: when.toISOString().slice(0, 10),
          ts: when.getTime(),
          item: { kind: "settlement", settlement: toSettlementDto(s), settled },
        });
      }

      const byDay = new Map<string, typeof entries>();
      for (const e of entries) {
        const list = byDay.get(e.day) ?? [];
        list.push(e);
        byDay.set(e.day, list);
      }
      const days = [...byDay.entries()]
        .sort((a, b) => (a[0] < b[0] ? 1 : -1))
        .map(([date, list]) => ({
          date,
          items: list.sort((a, b) => b.ts - a.ts).map((x) => x.item),
        }));
      const res: HistoryResponse = { days };
      return res;
    },
  );

  // POST add member (manual, from Settings)
  app.post(
    "/api/groups/:groupId/members",
    { preHandler: auth },
    async (req, reply) => {
      const { group } = req.jemaw!;
      const parsed = addMemberSchema.safeParse(req.body);
      if (!parsed.success) {
        return reply.code(400).send({ error: "invalid body" });
      }
      const tid = parsed.data.telegramUserId
        ? BigInt(parsed.data.telegramUserId)
        : null;
      const m = await addManualMember(
        db,
        group.id,
        parsed.data.displayName,
        tid,
      );
      return reply.code(201).send(toMemberDto(m));
    },
  );

  // PATCH rename member
  app.patch(
    "/api/groups/:groupId/members/:memberId",
    { preHandler: auth },
    async (req, reply) => {
      const { group } = req.jemaw!;
      const { memberId } = req.params as { memberId: string };
      const parsed = renameSchema.safeParse(req.body);
      if (!parsed.success) {
        return reply.code(400).send({ error: "invalid body" });
      }
      const m = await renameMember(
        db,
        group.id,
        memberId,
        parsed.data.displayName,
      );
      if (!m) return reply.code(404).send({ error: "member not found" });
      return toMemberDto(m);
    },
  );

  // PATCH a member's role (promote/demote) — admin only. Blocks demoting the
  // last admin so a group is never left with none.
  app.patch(
    "/api/groups/:groupId/members/:memberId/role",
    { preHandler: auth },
    async (req, reply) => {
      if (!requireAdmin(req, reply)) return;
      const { group } = req.jemaw!;
      const { memberId } = req.params as { memberId: string };
      const parsed = setRoleSchema.safeParse(req.body);
      if (!parsed.success) {
        return reply.code(400).send({ error: "invalid body" });
      }
      if (parsed.data.role === "member" && (await countAdmins(db, group.id)) <= 1) {
        // Only block if the target is currently an admin (the last one).
        const target = (await listMembers(db, group.id)).find(
          (m) => m.id === memberId,
        );
        if (target?.role === "admin") {
          return reply
            .code(409)
            .send({ error: "a group must keep at least one admin" });
        }
      }
      const updated = await setMemberRoleById(
        db,
        group.id,
        memberId,
        parsed.data.role,
      );
      if (!updated) return reply.code(404).send({ error: "member not found" });
      return toMemberDto(updated);
    },
  );

  // PATCH a member's primary flag (default-included in splits) — admin only.
  app.patch(
    "/api/groups/:groupId/members/:memberId/primary",
    { preHandler: auth },
    async (req, reply) => {
      if (!requireAdmin(req, reply)) return;
      const { group } = req.jemaw!;
      const { memberId } = req.params as { memberId: string };
      const parsed = setPrimarySchema.safeParse(req.body);
      if (!parsed.success) {
        return reply.code(400).send({ error: "invalid body" });
      }
      const updated = await setMemberPrimaryById(
        db,
        group.id,
        memberId,
        parsed.data.isPrimary,
      );
      if (!updated) return reply.code(404).send({ error: "member not found" });
      return toMemberDto(updated);
    },
  );

  // GET everything recorded about one member — admin only. Feeds the removal
  // review modal: KPIs plus the expenses and settlements the member appears in.
  app.get(
    "/api/groups/:groupId/members/:memberId/summary",
    { preHandler: auth },
    async (req, reply) => {
      if (!requireAdmin(req, reply)) return;
      const { group } = req.jemaw!;
      const { memberId } = req.params as { memberId: string };
      const members = await listMembers(db, group.id);
      const target = members.find((m) => m.id === memberId);
      if (!target) return reply.code(404).send({ error: "member not found" });

      const { nets, transfers, coveredExpenseIds } = await loadLedger(
        db,
        group.id,
      );
      const liveExpenses = await listLiveExpenses(db, group.id);
      const settlements = await listSettlements(db, group.id);
      const nameOf = (id: string) =>
        members.find((m) => m.id === id)?.displayName ?? "Member";

      let paidCents = 0;
      let shareCents = 0;
      const expenseItems: MemberExpenseItemDto[] = [];
      for (const e of liveExpenses) {
        const isPayer = e.expense.payerMemberId === memberId;
        const myShare = e.shares.find((s) => s.memberId === memberId);
        if (!isPayer && !myShare) continue;
        if (isPayer) paidCents += decimalToCents(e.expense.amount);
        if (myShare) shareCents += decimalToCents(myShare.shareAmount);
        expenseItems.push({
          id: e.expense.id,
          description: e.expense.description,
          amount: e.expense.amount,
          share: myShare ? myShare.shareAmount : "0.00",
          role: isPayer && myShare ? "both" : isPayer ? "payer" : "participant",
          occurredAt: e.expense.occurredAt.toISOString(),
          settled: coveredExpenseIds.has(e.expense.id),
        });
      }
      expenseItems.sort((a, b) => (a.occurredAt < b.occurredAt ? 1 : -1));

      const settlementItems: MemberSettlementItemDto[] = settlements
        .filter(
          (s) => s.fromMemberId === memberId || s.toMemberId === memberId,
        )
        .map((s) => ({
          id: s.id,
          amount: s.amount,
          direction: (s.fromMemberId === memberId ? "sent" : "received") as
            | "sent"
            | "received",
          counterpartName: nameOf(
            s.fromMemberId === memberId ? s.toMemberId : s.fromMemberId,
          ),
          method: s.method,
          when: (s.markedPaidAt ?? s.createdAt).toISOString(),
        }))
        .sort((a, b) => (a.when < b.when ? 1 : -1));

      const net = nets.find((n) => n.memberId === memberId)?.netCents ?? 0;
      const owes = transfers
        .filter((t) => t.fromMemberId === memberId)
        .reduce((sum, t) => sum + t.amountCents, 0);
      const owed = transfers
        .filter((t) => t.toMemberId === memberId)
        .reduce((sum, t) => sum + t.amountCents, 0);

      const res: MemberDataSummaryDto = {
        member: toMemberDto(target),
        kpis: {
          totalPaid: centsToDecimal(paidCents),
          totalShare: centsToDecimal(shareCents),
          net: centsToDecimal(net),
          outstandingOwes: centsToDecimal(owes),
          outstandingOwed: centsToDecimal(owed),
          expenseCount: expenseItems.length,
          settlementCount: settlementItems.length,
        },
        expenses: expenseItems,
        settlements: settlementItems,
      };
      return res;
    },
  );

  // DELETE a member — admin only. Hard-deletes when the member has no ledger
  // history; deactivates (kept for history, hidden from pickers) otherwise.
  app.delete(
    "/api/groups/:groupId/members/:memberId",
    { preHandler: auth },
    async (req, reply) => {
      if (!requireAdmin(req, reply)) return;
      const { group, member } = req.jemaw!;
      const { memberId } = req.params as { memberId: string };
      if (memberId === member.id) {
        return reply
          .code(409)
          .send({ error: "you can't remove yourself — ask another admin" });
      }
      const result = await removeMemberById(db, group.id, memberId);
      if (result === "not_found") {
        return reply.code(404).send({ error: "member not found" });
      }
      await refreshGroupSummarySafe(db, group.id);
      const res: RemoveMemberResponse = { removed: result };
      return res;
    },
  );

  // GET assignable Telegram identities — admin only. Every linked member's
  // current account plus chat message senders not yet attached to any member
  // (names resolved via the bot API when available).
  app.get(
    "/api/groups/:groupId/members/telegram-candidates",
    { preHandler: auth },
    async (req, reply) => {
      if (!requireAdmin(req, reply)) return;
      const { group } = req.jemaw!;
      const memberRows = await listMembers(db, group.id);
      const senderIds = await listMessageSenderIds(db, group.id);

      const candidates: TelegramCandidateDto[] = [];
      const linked = new Set<string>();
      for (const m of memberRows) {
        if (m.telegramUserId <= 0n) continue;
        linked.add(m.telegramUserId.toString());
        candidates.push({
          telegramUserId: m.telegramUserId.toString(),
          username: m.username,
          displayName: m.displayName,
          memberId: m.id,
          memberName: m.displayName,
        });
      }
      // Resolve unattached sender names in parallel — sequential getChatMember
      // calls made the picker feel like it never loaded.
      const unattached = senderIds.filter(
        (tid) => tid > 0n && !linked.has(tid.toString()),
      );
      const resolved = await Promise.all(
        unattached.map(async (tid): Promise<TelegramCandidateDto> => {
          let displayName: string | null = null;
          let username: string | null = null;
          if (deps.botApi) {
            try {
              const cm = await deps.botApi.getChatMember(
                Number(group.telegramChatId),
                Number(tid),
              );
              const full = [cm.user.first_name, cm.user.last_name]
                .filter(Boolean)
                .join(" ")
                .trim();
              displayName = full || cm.user.username || null;
              username = cm.user.username ?? null;
            } catch {
              // Left the chat or bot lacks rights — keep the raw id.
            }
          }
          return {
            telegramUserId: tid.toString(),
            username,
            displayName,
            memberId: null,
            memberName: null,
          };
        }),
      );
      candidates.push(...resolved);

      const res: TelegramCandidatesResponse = { candidates };
      return res;
    },
  );

  // PATCH a member's Telegram account — admin only. Assigns, swaps (when the
  // id is held by another member), or unlinks (null) the account.
  app.patch(
    "/api/groups/:groupId/members/:memberId/telegram",
    { preHandler: auth },
    async (req, reply) => {
      if (!requireAdmin(req, reply)) return;
      const { group } = req.jemaw!;
      const { memberId } = req.params as { memberId: string };
      const parsed = assignTelegramSchema.safeParse(req.body);
      if (!parsed.success) {
        return reply.code(400).send({ error: "invalid body" });
      }
      const tid =
        parsed.data.telegramUserId === null
          ? null
          : BigInt(parsed.data.telegramUserId);
      if (tid !== null && tid <= 0n) {
        return reply.code(400).send({ error: "invalid telegram user id" });
      }
      const result = await assignMemberTelegram(
        db,
        group.id,
        memberId,
        tid,
        parsed.data.username ?? null,
      );
      if (result.status === "not_found") {
        return reply.code(404).send({ error: "member not found" });
      }
      return toMemberDto(result.member);
    },
  );

  // ─── Suggestions (Phase 3) ──────────────────────────────────────────
  // GET pending suggestions (+ scanning flag for the polling UI)
  app.get(
    "/api/groups/:groupId/suggestions",
    { preHandler: auth },
    async (req) => {
      const { group } = req.jemaw!;
      const pending = await listPendingSuggestions(db, group.id);
      const res: SuggestionsResponse = {
        suggestions: pending.map(toSuggestionDto),
        scanning: false,
      };
      return res;
    },
  );

  // POST manual re-scan: run a Gemini scan on demand (pull-to-refresh).
  app.post(
    "/api/groups/:groupId/scan",
    { preHandler: auth },
    async (req, reply) => {
      const { group, member } = req.jemaw!;
      if (!deps.gemini) {
        console.warn(`[scan] manual skipped: AI scanning is not configured for group ${group.id}`);
        return reply.code(503).send({ error: "AI scanning is not configured" });
      }
      if (!deps.scanLimiter.tryAcquire(group.id)) {
        console.log(`[scan] manual rate-limited for group ${group.id}`);
        return reply.code(429).send({ error: "rate limited — try again shortly" });
      }
      console.log(`[scan] manual requested by member ${member.id} for group ${group.id}`);
      const { scanGroup } = await import("../ai/scan.js");
      const result = await scanGroup(
        { db, gemini: deps.gemini, now: () => Date.now() },
        group,
        member.id,
        "manual",
      );
      console.log(
        `[scan] manual result group=${group.id} status=${result.status} written=${result.written} pending=${result.pendingCount}`,
      );
      if (deps.botApi) {
        const { badgeEvidence } = await import("../telegram/reactions.js");
        await badgeEvidence(
          deps.botApi,
          Number(group.telegramChatId),
          result.evidenceMessageIds,
        ).catch((err) =>
          console.warn(`[scan] badge evidence failed: ${err?.message ?? err}`),
        );
        const fresh = await getGroupById(db, group.id);
        if (fresh) {
          const { maybeDeliverScanHumor } = await import(
            "../ai/humor/deliver.js"
          );
          await maybeDeliverScanHumor({
            db,
            api: deps.botApi,
            group: fresh,
            written: result.written,
            pendingCount: result.pendingCount,
            scanStatus: result.status,
            directInvocation: true,
            currency: fresh.defaultCurrency,
            humor: deps.humor ?? {},
          }).catch((err) =>
            console.warn(`[humor] manual scan deliver failed:`, err?.message ?? err),
          );
        }
      }
      return reply.send(result);
    },
  );

  // GET humor settings
  app.get(
    "/api/groups/:groupId/humor",
    { preHandler: auth },
    async (req) => {
      const { group } = req.jemaw!;
      const { parseHumorSettings, toHumorSettingsDto } = await import(
        "@jemaw/shared/humor"
      );
      const raw = (group.settings as Record<string, unknown> | null)?.humor;
      return toHumorSettingsDto(parseHumorSettings(raw));
    },
  );

  // PATCH humor settings — admin only
  app.patch(
    "/api/groups/:groupId/humor",
    { preHandler: auth },
    async (req, reply) => {
      if (!requireAdmin(req, reply)) return;
      const { group, member } = req.jemaw!;
      const body = (req.body ?? {}) as Record<string, unknown>;
      const { parseHumorSettings, toHumorSettingsDto, HUMOR_MODE_LIMITS } =
        await import("@jemaw/shared/humor");
      const current = parseHumorSettings(
        (group.settings as Record<string, unknown> | null)?.humor,
      );
      const modes = ["off", "jemaw_dry", "roast", "chaos"] as const;
      if (body.mode != null && !modes.includes(body.mode as (typeof modes)[number])) {
        return reply.code(400).send({ error: "invalid mode" });
      }
      const next = { ...current };
      if (body.mode != null) next.mode = body.mode as typeof next.mode;
      if (typeof body.publicRepliesEnabled === "boolean") {
        next.publicRepliesEnabled = body.publicRepliesEnabled;
      }
      if (typeof body.useModelComposer === "boolean") {
        next.useModelComposer = body.useModelComposer;
      }
      if (typeof body.maxPublicRepliesPerDay === "number") {
        next.maxPublicRepliesPerDay = Math.max(
          0,
          Math.min(24, Math.floor(body.maxPublicRepliesPerDay)),
        );
      }
      if (typeof body.cooldownMinutes === "number") {
        next.cooldownMinutes = Math.max(
          0,
          Math.min(24 * 60, Math.floor(body.cooldownMinutes)),
        );
      }
      if (body.languageMode === "auto" || body.languageMode === "en" || body.languageMode === "am" || body.languageMode === "code_mix") {
        next.languageMode = body.languageMode;
      }
      if (body.muteDays != null) {
        const days = Number(body.muteDays);
        if (days > 0) {
          next.mutedUntil = new Date(
            Date.now() + days * 24 * 60 * 60 * 1000,
          ).toISOString();
        } else {
          next.mutedUntil = undefined;
        }
      }
      if (body.mode && body.mode !== "off" && body.mode !== current.mode) {
        next.enabledByMemberId = member.id;
        next.enabledAt = new Date().toISOString();
        const lim = HUMOR_MODE_LIMITS[body.mode as keyof typeof HUMOR_MODE_LIMITS];
        if (lim && body.maxPublicRepliesPerDay == null) {
          next.maxPublicRepliesPerDay = lim.maxPublicRepliesPerDay;
        }
        if (lim && body.cooldownMinutes == null) {
          next.cooldownMinutes = lim.cooldownMinutes;
        }
      }
      await mergeGroupSettings(db, group.id, { humor: next });
      const updated = await getGroupById(db, group.id);
      const humor = parseHumorSettings(
        (updated?.settings as Record<string, unknown> | null)?.humor,
      );
      return toHumorSettingsDto(humor);
    },
  );

  // POST feedback on a bot reply
  app.post(
    "/api/groups/:groupId/humor/feedback",
    { preHandler: auth },
    async (req, reply) => {
      const { group, member } = req.jemaw!;
      const body = (req.body ?? {}) as {
        botReplyId?: string;
        feedbackType?: string;
      };
      const allowed = [
        "funny",
        "not_for_us",
        "too_much",
        "wrong_tone",
        "wrong_fact",
        "mute",
      ];
      if (!body.botReplyId || !body.feedbackType || !allowed.includes(body.feedbackType)) {
        return reply.code(400).send({ error: "invalid body" });
      }
      const {
        getBotReply,
        insertBotReplyFeedback,
        mergeGroupSettings,
      } = await import("../repo.js");
      const row = await getBotReply(db, group.id, body.botReplyId);
      if (!row) return reply.code(404).send({ error: "reply not found" });
      await insertBotReplyFeedback(
        db,
        body.botReplyId,
        member.id,
        body.feedbackType,
      );
      if (body.feedbackType === "mute") {
        const { parseHumorSettings } = await import("@jemaw/shared/humor");
        const current = parseHumorSettings(
          (group.settings as Record<string, unknown> | null)?.humor,
        );
        await mergeGroupSettings(db, group.id, {
          humor: {
            ...current,
            mutedUntil: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
          },
        });
      }
      if (body.feedbackType === "wrong_fact") {
        console.warn(
          `[humor] wrong_fact feedback group=${group.id} reply=${body.botReplyId}`,
        );
      }
      return { ok: true };
    },
  );

  // POST confirm a suggestion → create an expense (or record a settlement).
  app.post(
    "/api/groups/:groupId/suggestions/:suggestionId/confirm",
    { preHandler: auth },
    async (req, reply) => {
      const { group, member } = req.jemaw!;
      const { suggestionId } = req.params as { suggestionId: string };
      const s = await getSuggestion(db, group.id, suggestionId);
      if (!s) return reply.code(404).send({ error: "not found" });
      if (s.status !== "pending") {
        return reply.code(409).send({ error: "already resolved" });
      }

      // ── settlement suggestion → record via allocation-based create ──
      if (s.kind === "settlement") {
        if (!s.fromMemberId || !s.toMemberId) {
          return reply.code(400).send({ error: "settlement is missing parties" });
        }
        if (!s.amount) {
          return reply
            .code(400)
            .send({ error: "amount required for this settlement; edit it" });
        }
        // Suggestions need expenseIds to allocate. If none attached (e.g. AI
        // didn't match any expense yet), require the user to open the form.
        const suggestionExpenseIds = (s.expenseIds as string[] | null) ?? [];
        if (suggestionExpenseIds.length === 0) {
          return reply.code(400).send({
            error: "select the expenses this settlement covers — open the form to edit",
          });
        }
        const body = (req.body ?? {}) as { amount?: string };
        const result = await recordSettlementFromInput(group, member, {
          fromMemberId: s.fromMemberId,
          toMemberId: s.toMemberId,
          amount: body.amount ?? s.amount,
          expenseIds: suggestionExpenseIds,
        });
        if ("error" in result) {
          return reply.code(result.status ?? 409).send({ error: result.error, ...result.extra });
        }
        await resolveSuggestion(db, s.id, "confirmed", member.id, new Date());
        await refreshGroupSummarySafe(db, group.id);
        return reply.code(201).send(toSettlementDto(result.settlement));
      }

      // ── expense or loan suggestion → create a ledger entry ──
      if (!s.payerMemberId) {
        return reply.code(400).send({ error: "suggestion has no payer; edit it" });
      }
      if (!s.amount) {
        return reply.code(400).send({ error: "suggestion has no amount; edit it" });
      }

      const splitWith = (s.splitWith as string[]) ?? [];
      const totalCents = decimalToCents(s.amount);
      let shares: { memberId: string; shareAmount: string }[];
      try {
        if (s.kind === "loan") {
          if (splitWith.length !== 1 || splitWith[0] === s.payerMemberId) {
            return reply.code(400).send({ error: "loan suggestion has invalid parties" });
          }
          shares = [{ memberId: splitWith[0]!, shareAmount: centsToDecimal(totalCents) }];
        } else {
          const computed = computeSplit({
            totalCents,
            splitType: s.splitType,
            memberIds: splitWith,
            shares: (s.shares as Record<string, number> | null) ?? undefined,
          });
          shares = computed.map((c) => ({
            memberId: c.memberId,
            shareAmount: centsToDecimal(c.shareCents),
          }));
        }
      } catch (err) {
        return reply
          .code(400)
          .send({ error: err instanceof Error ? err.message : "bad split" });
      }

      const created = await createExpenseWithShares(
        db,
        {
          groupId: group.id,
          payerMemberId: s.payerMemberId,
          amount: centsToDecimal(totalCents),
          kind: s.kind,
          currency: group.defaultCurrency,
          description: s.description,
          createdByMemberId: member.id,
          source: "ai_confirmed",
          sourceSuggestionId: s.id,
          occurredAt: new Date(),
        },
        shares,
      );
      await resolveSuggestion(db, s.id, "confirmed", member.id, new Date());
      await refreshGroupSummarySafe(db, group.id);
      return reply.code(201).send(toExpenseDto(created));
    },
  );

  // POST edit a suggestion → create an edited expense from supplied values.
  app.post(
    "/api/groups/:groupId/suggestions/:suggestionId/edit",
    { preHandler: auth },
    async (req, reply) => {
      const { group, member } = req.jemaw!;
      const { suggestionId } = req.params as { suggestionId: string };
      const s = await getSuggestion(db, group.id, suggestionId);
      if (!s) return reply.code(404).send({ error: "not found" });
      if (s.status !== "pending") {
        return reply.code(409).send({ error: "already resolved" });
      }
      if (s.kind === "settlement") {
        const parsed = createSettlementSchema.safeParse(req.body);
        if (!parsed.success) return reply.code(400).send({ error: "invalid body" });
        const recorded = await recordSettlementFromInput(group, member, parsed.data);
        if ("error" in recorded) {
          return reply
            .code(recorded.status ?? 409)
            .send({ error: recorded.error, ...recorded.extra });
        }
        await resolveSuggestion(db, s.id, "edited", member.id, new Date());
        await refreshGroupSummarySafe(db, group.id);
        return reply.code(201).send(toSettlementDto(recorded.settlement));
      }
      const parsed = createExpenseSchema.safeParse(req.body);
      if (!parsed.success) return reply.code(400).send({ error: "invalid body" });
      const body = parsed.data;
      const members = await listMembers(db, group.id);
      const built = buildShareRows(body, new Set(members.map((m) => m.id)));
      if ("error" in built) return reply.code(400).send({ error: built.error });

      const created = await createExpenseWithShares(
        db,
        {
          groupId: group.id,
          payerMemberId: body.payerMemberId,
          amount: centsToDecimal(decimalToCents(body.amount)),
          kind: body.kind,
          currency: group.defaultCurrency,
          description: body.description,
          createdByMemberId: member.id,
          source: "ai_edited",
          sourceSuggestionId: s.id,
          occurredAt: body.occurredAt ? new Date(body.occurredAt) : new Date(),
        },
        built.shares,
      );
      await resolveSuggestion(db, s.id, "edited", member.id, new Date());
      await refreshGroupSummarySafe(db, group.id);
      return reply.code(201).send(toExpenseDto(created));
    },
  );

  // POST dismiss a suggestion.
  app.post(
    "/api/groups/:groupId/suggestions/:suggestionId/dismiss",
    { preHandler: auth },
    async (req, reply) => {
      const { group, member } = req.jemaw!;
      const { suggestionId } = req.params as { suggestionId: string };
      const s = await getSuggestion(db, group.id, suggestionId);
      if (!s) return reply.code(404).send({ error: "not found" });
      if (s.status !== "pending") {
        return reply.code(409).send({ error: "already resolved" });
      }
      await resolveSuggestion(db, s.id, "dismissed", member.id, new Date());
      return reply.code(200).send({ ok: true });
    },
  );
}
