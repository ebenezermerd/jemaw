/**
 * Phase 1 REST API. All routes live under /api/groups/:groupId and run behind
 * the initData auth hook. Bodies validated with zod.
 */
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { Db } from "../db.js";
import { makeAuthHook, type AuthDeps } from "../auth/authHook.js";
import {
  listMembers,
  listLiveExpenses,
  createExpenseWithShares,
  updateExpenseWithShares,
  voidExpense,
  getExpense,
  groupHasExpenses,
  groupHasNewMessages,
  listSettlements,
  createSettlement,
  listPendingSuggestions,
  getSuggestion,
  resolveSuggestion,
  addManualMember,
  renameMember,
  updateGroupCurrency,
} from "../repo.js";
import { computeSplit } from "../domain/splits.js";
import {
  computeBalances,
  type ExpenseForBalance,
  type MemberNet,
} from "../domain/balances.js";
import { computeSettlement } from "../domain/settle.js";
import {
  decimalToCents,
  centsToDecimal,
  type HistoryResponse,
  type HistoryItem,
  type SettlePlanResponse,
} from "@jemaw/shared/types";
import type { Member } from "@jemaw/shared/schema";
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
} from "@jemaw/shared/types";
import type { ScanRateLimiter } from "../ai/rateLimit.js";

/**
 * Compute the current net balances for a group from live expenses + paid
 * settlements. Shared by the balances, settle, and mark-paid endpoints so the
 * math is defined in exactly one place.
 */
async function loadBalances(
  db: Db,
  groupId: string,
): Promise<{ members: Member[]; nets: MemberNet[] }> {
  const members = await listMembers(db, groupId);
  const expenses = await listLiveExpenses(db, groupId);
  const settlements = await listSettlements(db, groupId);
  const forBalance: ExpenseForBalance[] = expenses.map((e) => ({
    payerMemberId: e.expense.payerMemberId,
    amountCents: decimalToCents(e.expense.amount),
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
  return { members, nets };
}

/** Validated expense input shape (shared by create + edit). */
type ExpenseInput = z.infer<typeof createExpenseSchema>;

/**
 * Validate members + compute share rows for an expense. Returns either the
 * decimal-string share rows, or an error string for a 400 response.
 */
function buildShareRows(
  input: ExpenseInput,
  groupId: string,
  memberIds: Set<string>,
  seedSuffix: string,
): { shares: { memberId: string; shareAmount: string }[] } | { error: string } {
  if (!memberIds.has(input.payerMemberId)) return { error: "payer not in group" };
  for (const id of input.splitWith) {
    if (!memberIds.has(id)) return { error: `member ${id} not in group` };
  }
  const totalCents = decimalToCents(input.amount);
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
      expenseSeed: `${groupId}:${input.description}:${input.amount}:${seedSuffix}`,
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
  expenseIds: z.array(z.string().uuid()).optional(),
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

export interface ApiDeps {
  db: Db;
  botToken: string;
  now: () => number;
  /** Present when GEMINI_API_KEY is set — enables the manual re-scan endpoint. */
  gemini?: import("../ai/geminiClient.js").GeminiClient;
  scanLimiter: ScanRateLimiter;
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

  // GET group meta + members
  app.get(
    "/api/groups/:groupId",
    { preHandler: auth },
    async (req) => {
      const { group } = req.jemaw!;
      const members = await listMembers(db, group.id);
      const hasExpenses = await groupHasExpenses(db, group.id);
      const canScan = deps.gemini
        ? await groupHasNewMessages(db, group.id)
        : false;
      return toGroupDto(group, members, hasExpenses, canScan);
    },
  );

  // PATCH group settings (currency) — blocked once expenses exist.
  app.patch(
    "/api/groups/:groupId",
    { preHandler: auth },
    async (req, reply) => {
      const { group } = req.jemaw!;
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
        return toGroupDto(updated, members, false, false);
      }
      const members = await listMembers(db, group.id);
      const hasExpenses = await groupHasExpenses(db, group.id);
      const canScan = deps.gemini
        ? await groupHasNewMessages(db, group.id)
        : false;
      return toGroupDto(group, members, hasExpenses, canScan);
    },
  );

  // GET the calling member's personal summary (Home card).
  app.get(
    "/api/groups/:groupId/me/summary",
    { preHandler: auth },
    async (req) => {
      const { group, member } = req.jemaw!;
      const { nets } = await loadBalances(db, group.id);
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
      const { members, nets } = await loadBalances(db, group.id);
      const nameOf = (id: string) =>
        members.find((m) => m.id === id)?.displayName ?? "Member";
      return toBalanceDtos(nets, nameOf);
    },
  );

  // GET live settle-up plan
  app.get(
    "/api/groups/:groupId/settle",
    { preHandler: auth },
    async (req) => {
      const { group } = req.jemaw!;
      const { nets } = await loadBalances(db, group.id);
      const transfers = computeSettlement(nets).map(toTransferDto);
      const res: SettlePlanResponse = { transfers };
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

  // POST record a settlement. Payer defaults to the caller; amount is clamped
  // to the live debt (omit to settle in full). Carries method/description/
  // expenseIds/date metadata from the settle form.
  app.post(
    "/api/groups/:groupId/settlements",
    { preHandler: auth },
    async (req, reply) => {
      const { group, member } = req.jemaw!;
      const parsed = createSettlementSchema.safeParse(req.body);
      if (!parsed.success) {
        return reply.code(400).send({ error: "invalid body" });
      }
      const body = parsed.data;
      const fromMemberId = body.fromMemberId ?? member.id;
      const { toMemberId } = body;

      // Recompute the live plan and find this exact debtor->creditor transfer.
      const { nets } = await loadBalances(db, group.id);
      const plan = computeSettlement(nets);
      const transfer = plan.find(
        (t) => t.fromMemberId === fromMemberId && t.toMemberId === toMemberId,
      );
      if (!transfer) {
        return reply.code(409).send({
          error: "no current debt between these members",
          transfers: plan.map(toTransferDto),
        });
      }

      // Amount: requested (clamped to debt) or the full debt.
      const requestedCents = body.amount
        ? decimalToCents(body.amount)
        : transfer.amountCents;
      const amountCents = Math.min(requestedCents, transfer.amountCents);

      const created = await createSettlement(db, {
        groupId: group.id,
        fromMemberId,
        toMemberId,
        amount: centsToDecimal(amountCents),
        currency: group.defaultCurrency,
        method: body.method ?? "cash",
        description: body.description ?? null,
        expenseIds: body.expenseIds ?? null,
        occurredAt: body.occurredAt ? new Date(body.occurredAt) : new Date(),
        markedPaidAt: new Date(),
        markedPaidByMemberId: member.id,
      });
      return reply.code(201).send(toSettlementDto(created));
    },
  );

  // GET expenses list
  app.get(
    "/api/groups/:groupId/expenses",
    { preHandler: auth },
    async (req) => {
      const { group } = req.jemaw!;
      const expenses = await listLiveExpenses(db, group.id);
      return expenses.map(toExpenseDto);
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

  // PATCH edit an expense (recompute shares)
  app.patch(
    "/api/groups/:groupId/expenses/:expenseId",
    { preHandler: auth },
    async (req, reply) => {
      const { group } = req.jemaw!;
      const { expenseId } = req.params as { expenseId: string };
      const parsed = createExpenseSchema.safeParse(req.body);
      if (!parsed.success) {
        return reply.code(400).send({ error: "invalid body" });
      }
      const body = parsed.data;
      const members = await listMembers(db, group.id);
      const built = buildShareRows(
        body,
        group.id,
        new Set(members.map((m) => m.id)),
        expenseId,
      );
      if ("error" in built) return reply.code(400).send({ error: built.error });

      try {
        const updated = await updateExpenseWithShares(
          db,
          group.id,
          expenseId,
          {
            payerMemberId: body.payerMemberId,
            amount: centsToDecimal(decimalToCents(body.amount)),
            description: body.description,
            occurredAt: body.occurredAt ? new Date(body.occurredAt) : undefined,
          },
          built.shares,
        );
        if (!updated) return reply.code(404).send({ error: "not found" });
        return toExpenseDto(updated);
      } catch (err) {
        return reply.code(409).send({
          error: err instanceof Error ? err.message : "cannot edit",
        });
      }
    },
  );

  // POST void an expense (soft delete)
  app.post(
    "/api/groups/:groupId/expenses/:expenseId/void",
    { preHandler: auth },
    async (req, reply) => {
      const { group } = req.jemaw!;
      const { expenseId } = req.params as { expenseId: string };
      const result = await voidExpense(db, group.id, expenseId, new Date());
      if (result === "not_found") {
        return reply.code(404).send({ error: "not found" });
      }
      if (result === "already_voided") {
        return reply.code(409).send({ error: "already voided" });
      }
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
      const memberIds = new Set(members.map((m) => m.id));
      if (!memberIds.has(body.payerMemberId)) {
        return reply.code(400).send({ error: "payer not in group" });
      }
      for (const id of body.splitWith) {
        if (!memberIds.has(id)) {
          return reply.code(400).send({ error: `member ${id} not in group` });
        }
      }

      const totalCents = decimalToCents(body.amount);

      let computed;
      try {
        computed = computeSplit({
          totalCents,
          splitType: body.splitType,
          memberIds: body.splitWith,
          shares: body.shares,
          exactCents: body.exact
            ? Object.fromEntries(
                Object.entries(body.exact).map(([k, v]) => [
                  k,
                  decimalToCents(v),
                ]),
              )
            : undefined,
          // expense id not yet known; use a stable seed from inputs.
          expenseSeed: `${group.id}:${body.description}:${body.amount}`,
        });
      } catch (err) {
        return reply
          .code(400)
          .send({ error: err instanceof Error ? err.message : "bad split" });
      }

      const occurredAt = body.occurredAt
        ? new Date(body.occurredAt)
        : new Date();

      const created = await createExpenseWithShares(
        db,
        {
          groupId: group.id,
          payerMemberId: body.payerMemberId,
          amount: centsToDecimal(totalCents),
          currency: group.defaultCurrency,
          description: body.description,
          createdByMemberId: member.id,
          source: "manual",
          occurredAt,
        },
        computed.map((c) => ({
          memberId: c.memberId,
          shareAmount: centsToDecimal(c.shareCents),
        })),
      );

      return reply.code(201).send(toExpenseDto(created));
    },
  );

  // GET history (expenses + settlements, grouped by day)
  app.get(
    "/api/groups/:groupId/history",
    { preHandler: auth },
    async (req) => {
      const { group } = req.jemaw!;
      const { memberId } = req.query as { memberId?: string };

      let expenses = await listLiveExpenses(db, group.id);
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
        entries.push({
          day: e.expense.occurredAt.toISOString().slice(0, 10),
          ts: e.expense.occurredAt.getTime(),
          item: { kind: "expense", expense: toExpenseDto(e) },
        });
      }
      for (const s of settlements) {
        const when = s.markedPaidAt ?? s.createdAt;
        entries.push({
          day: when.toISOString().slice(0, 10),
          ts: when.getTime(),
          item: { kind: "settlement", settlement: toSettlementDto(s) },
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
        return reply.code(503).send({ error: "AI scanning is not configured" });
      }
      if (!deps.scanLimiter.tryAcquire(group.id)) {
        return reply.code(429).send({ error: "rate limited — wait 60s" });
      }
      const { scanGroup } = await import("../ai/scan.js");
      const result = await scanGroup(
        { db, gemini: deps.gemini, now: () => Date.now() },
        group,
        member.id,
        "manual",
      );
      return reply.send(result);
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

      // ── settlement suggestion → record a settlement, clamped to the debt ──
      if (s.kind === "settlement") {
        if (!s.fromMemberId || !s.toMemberId) {
          return reply.code(400).send({ error: "settlement is missing parties" });
        }
        const body = (req.body ?? {}) as { amount?: string };
        const statedDecimal = body.amount ?? s.amount;
        if (!statedDecimal) {
          return reply
            .code(400)
            .send({ error: "amount required for this settlement; edit it" });
        }
        const statedCents = decimalToCents(statedDecimal);

        // Clamp to the current debt from→to (same as manual mark-as-paid).
        const { nets } = await loadBalances(db, group.id);
        const plan = computeSettlement(nets);
        const transfer = plan.find(
          (t) => t.fromMemberId === s.fromMemberId && t.toMemberId === s.toMemberId,
        );
        if (!transfer) {
          return reply.code(409).send({
            error: "no current debt between these members",
          });
        }
        const amountCents = Math.min(statedCents, transfer.amountCents);
        const created = await createSettlement(db, {
          groupId: group.id,
          fromMemberId: s.fromMemberId,
          toMemberId: s.toMemberId,
          amount: centsToDecimal(amountCents),
          currency: group.defaultCurrency,
          markedPaidAt: new Date(),
          markedPaidByMemberId: member.id,
        });
        await resolveSuggestion(db, s.id, "confirmed", member.id, new Date());
        return reply.code(201).send(toSettlementDto(created));
      }

      // ── expense suggestion → create an expense ──
      if (!s.payerMemberId) {
        return reply.code(400).send({ error: "suggestion has no payer; edit it" });
      }
      if (!s.amount) {
        return reply.code(400).send({ error: "suggestion has no amount; edit it" });
      }

      const splitWith = (s.splitWith as string[]) ?? [];
      const totalCents = decimalToCents(s.amount);
      let computed;
      try {
        computed = computeSplit({
          totalCents,
          splitType: s.splitType,
          memberIds: splitWith,
          shares: (s.shares as Record<string, number> | null) ?? undefined,
          expenseSeed: s.id,
        });
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
          currency: group.defaultCurrency,
          description: s.description,
          createdByMemberId: member.id,
          source: "ai_confirmed",
          sourceSuggestionId: s.id,
          occurredAt: new Date(),
        },
        computed.map((c) => ({
          memberId: c.memberId,
          shareAmount: centsToDecimal(c.shareCents),
        })),
      );
      await resolveSuggestion(db, s.id, "confirmed", member.id, new Date());
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
      const parsed = createExpenseSchema.safeParse(req.body);
      if (!parsed.success) return reply.code(400).send({ error: "invalid body" });
      const body = parsed.data;
      const members = await listMembers(db, group.id);
      const built = buildShareRows(
        body,
        group.id,
        new Set(members.map((m) => m.id)),
        s.id,
      );
      if ("error" in built) return reply.code(400).send({ error: built.error });

      const created = await createExpenseWithShares(
        db,
        {
          groupId: group.id,
          payerMemberId: body.payerMemberId,
          amount: centsToDecimal(decimalToCents(body.amount)),
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
