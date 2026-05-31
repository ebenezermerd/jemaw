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
  getExpense,
  groupHasExpenses,
  addManualMember,
  renameMember,
} from "../repo.js";
import { computeSplit } from "../domain/splits.js";
import { computeBalances, type ExpenseForBalance } from "../domain/balances.js";
import {
  decimalToCents,
  centsToDecimal,
  type HistoryResponse,
} from "@jemaw/shared/types";
import {
  toGroupDto,
  toExpenseDto,
  toBalanceDtos,
  toMemberDto,
} from "./mappers.js";

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

const addMemberSchema = z.object({
  displayName: z.string().min(1).max(80),
  telegramUserId: z.string().optional(),
});

const renameSchema = z.object({ displayName: z.string().min(1).max(80) });

export interface ApiDeps {
  db: Db;
  botToken: string;
  now: () => number;
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
      return toGroupDto(group, members, hasExpenses);
    },
  );

  // GET balances
  app.get(
    "/api/groups/:groupId/balances",
    { preHandler: auth },
    async (req) => {
      const { group } = req.jemaw!;
      const members = await listMembers(db, group.id);
      const expenses = await listLiveExpenses(db, group.id);
      const forBalance: ExpenseForBalance[] = expenses.map((e) => ({
        payerMemberId: e.expense.payerMemberId,
        amountCents: decimalToCents(e.expense.amount),
        shares: e.shares.map((s) => ({
          memberId: s.memberId,
          shareCents: decimalToCents(s.shareAmount),
        })),
      }));
      const nets = computeBalances(
        members.map((m) => m.id),
        forBalance,
      );
      const nameOf = (id: string) =>
        members.find((m) => m.id === id)?.displayName ?? "Member";
      return toBalanceDtos(nets, nameOf);
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

  // GET history (grouped by day)
  app.get(
    "/api/groups/:groupId/history",
    { preHandler: auth },
    async (req) => {
      const { group } = req.jemaw!;
      const { memberId } = req.query as { memberId?: string };
      let expenses = await listLiveExpenses(db, group.id);
      if (memberId) {
        expenses = expenses.filter(
          (e) =>
            e.expense.payerMemberId === memberId ||
            e.shares.some((s) => s.memberId === memberId),
        );
      }
      const byDay = new Map<string, ReturnType<typeof toExpenseDto>[]>();
      for (const e of expenses) {
        const day = e.expense.occurredAt.toISOString().slice(0, 10);
        const list = byDay.get(day) ?? [];
        list.push(toExpenseDto(e));
        byDay.set(day, list);
      }
      const days = [...byDay.entries()]
        .sort((a, b) => (a[0] < b[0] ? 1 : -1))
        .map(([date, exps]) => ({ date, expenses: exps }));
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
}
