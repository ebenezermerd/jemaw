import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createDb, type Db } from "../db.js";
import { buildServer } from "../server.js";
import { upsertGroup, upsertMember, addManualMember } from "../repo.js";
import { signInitDataForTest } from "../auth/initData.js";
import {
  groups,
  members,
  expenses,
  expenseShares,
  settlements,
  settlementAllocations,
} from "@jemaw/shared/schema";
import { eq, inArray } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import type {
  SettlePlanResponse,
  ExpenseDto,
  SettlementDto,
  HistoryResponse,
} from "@jemaw/shared/types";

const DATABASE_URL = process.env.DATABASE_URL;
const BOT_TOKEN = "999999:ALLOC-TEST-TOKEN";
const NOW = 1_790_000_000;
const d = DATABASE_URL ? describe : describe.skip;

d("Allocation-based settlements", () => {
  let db: Db;
  let app: FastifyInstance;
  let groupId: string;
  let aliceTg: bigint;
  let bobTg: bigint;
  let carolTg: bigint;
  let aliceId: string;
  let bobId: string;
  let carolId: string;

  const auth = (tg: bigint) => ({
    "x-telegram-init-data": signInitDataForTest(
      {
        auth_date: String(NOW - 5),
        user: JSON.stringify({ id: Number(tg), first_name: "U" }),
      },
      BOT_TOKEN,
    ),
  });

  beforeAll(async () => {
    db = createDb(DATABASE_URL!);
    const base = BigInt(-4_000_000_000 - Math.floor(process.uptime() * 1000));
    aliceTg = base - 1n;
    bobTg = base - 2n;
    carolTg = base - 3n;
    const g = await upsertGroup(db, base, "AllocTestGroup", "ETB");
    groupId = g.id;
    aliceId = (await upsertMember(db, groupId, aliceTg, "Alice", null)).id;
    bobId = (await upsertMember(db, groupId, bobTg, "Bob", null)).id;
    carolId = (await upsertMember(db, groupId, carolTg, "Carol", null)).id;
    app = await buildServer({
      api: { db, botToken: BOT_TOKEN, now: () => NOW, scanLimiter: { tryAcquire: () => true } as never },
      corsOrigin: undefined,
    });
  });

  afterAll(async () => {
    // Delete in FK order: allocations → settlements → shares → expenses → members → groups
    const groupSettlements = await db
      .select({ id: settlements.id })
      .from(settlements)
      .where(eq(settlements.groupId, groupId));
    if (groupSettlements.length > 0) {
      await db.delete(settlementAllocations).where(
        inArray(settlementAllocations.settlementId, groupSettlements.map((s) => s.id)),
      );
    }
    await db.delete(settlements).where(eq(settlements.groupId, groupId));
    const groupExpenses = await db
      .select({ id: expenses.id })
      .from(expenses)
      .where(eq(expenses.groupId, groupId));
    if (groupExpenses.length > 0) {
      await db.delete(expenseShares).where(
        inArray(expenseShares.expenseId, groupExpenses.map((e) => e.id)),
      );
    }
    await db.delete(expenses).where(eq(expenses.groupId, groupId));
    await db.delete(members).where(eq(members.groupId, groupId));
    await db.delete(groups).where(eq(groups.id, groupId));
    await app.close();
  });

  // Helper: create an expense (Alice pays, Bob owes her)
  async function createExpense(amount: string, description: string, occurredAt?: string) {
    const res = await app.inject({
      method: "POST",
      url: `/api/groups/${groupId}/expenses`,
      headers: auth(aliceTg),
      payload: {
        description,
        amount,
        payerMemberId: aliceId,
        splitType: "equal",
        splitWith: [aliceId, bobId],
        occurredAt: occurredAt ?? "2026-01-15T12:00:00.000Z",
      },
    });
    expect(res.statusCode).toBe(201);
    return res.json<ExpenseDto>();
  }

  it("settle with expenseIds writes allocations and expense becomes covered", async () => {
    const expense = await createExpense("100.00", "Dinner");

    // Bob settles his 50 share, selecting the expense
    const res = await app.inject({
      method: "POST",
      url: `/api/groups/${groupId}/settlements`,
      headers: auth(bobTg),
      payload: {
        fromMemberId: bobId,
        toMemberId: aliceId,
        amount: "50.00",
        expenseIds: [expense.id],
        method: "cash",
        occurredAt: "2026-01-20T12:00:00.000Z",
      },
    });
    expect(res.statusCode).toBe(201);
    const s = res.json<SettlementDto>();
    expect(s.expenseIds).toContain(expense.id);

    // Verify allocation row exists in DB
    const allocs = await db
      .select()
      .from(settlementAllocations)
      .where(eq(settlementAllocations.settlementId, s.id));
    expect(allocs).toHaveLength(1);
    expect(allocs[0]!.allocatedAmount).toBe("50.00");

    // Expense should be covered: omitted from GET /expenses
    const expRes = await app.inject({
      method: "GET",
      url: `/api/groups/${groupId}/expenses`,
      headers: auth(aliceTg),
    });
    const expList = expRes.json<ExpenseDto[]>();
    expect(expList.find((e) => e.id === expense.id)).toBeUndefined();

    // Settle plan should show no transfer for this pair
    const planRes = await app.inject({
      method: "GET",
      url: `/api/groups/${groupId}/settle`,
      headers: auth(aliceTg),
    });
    const plan = planRes.json<SettlePlanResponse>();
    const leftover = plan.transfers.find(
      (t) => t.fromMemberId === bobId && t.toMemberId === aliceId,
    );
    expect(leftover).toBeUndefined();

    // History should include it with settled:true
    const histRes = await app.inject({
      method: "GET",
      url: `/api/groups/${groupId}/history`,
      headers: auth(aliceTg),
    });
    const hist = histRes.json<HistoryResponse>();
    const allItems = hist.days.flatMap((d) => d.items);
    const histExpense = allItems.find(
      (item) => item.kind === "expense" && item.expense.id === expense.id,
    );
    expect(histExpense).toBeDefined();
    expect(histExpense!.settled).toBe(true);
  });

  it("over-pay returns 409 with maxAllocatable", async () => {
    const expense = await createExpense("80.00", "Lunch");

    const res = await app.inject({
      method: "POST",
      url: `/api/groups/${groupId}/settlements`,
      headers: auth(bobTg),
      payload: {
        fromMemberId: bobId,
        toMemberId: aliceId,
        amount: "99.00", // bob only owes 40
        expenseIds: [expense.id],
      },
    });
    expect(res.statusCode).toBe(409);
    const body = res.json();
    expect(body.error).toMatch(/exceeds/);
    expect(body.maxAllocatable).toBe("40.00");

    // No settlement written
    const expRes = await app.inject({
      method: "GET",
      url: `/api/groups/${groupId}/expenses`,
      headers: auth(aliceTg),
    });
    expect(expRes.json<ExpenseDto[]>().find((e) => e.id === expense.id)).toBeDefined();
  });

  it("empty expenseIds returns 400", async () => {
    const res = await app.inject({
      method: "POST",
      url: `/api/groups/${groupId}/settlements`,
      headers: auth(bobTg),
      payload: {
        fromMemberId: bobId,
        toMemberId: aliceId,
        amount: "10.00",
        expenseIds: [], // empty — must fail zod min(1)
      },
    });
    expect(res.statusCode).toBe(400);
  });

  it("unrelated expense (Carol's expense) returns 409", async () => {
    // Carol pays, Bob has no share
    const carolRes = await app.inject({
      method: "POST",
      url: `/api/groups/${groupId}/expenses`,
      headers: auth(carolTg),
      payload: {
        description: "Carol's taxi",
        amount: "60.00",
        payerMemberId: carolId,
        splitType: "equal",
        splitWith: [carolId],
      },
    });
    expect(carolRes.statusCode).toBe(201);
    const carolExpense = carolRes.json<ExpenseDto>();

    const res = await app.inject({
      method: "POST",
      url: `/api/groups/${groupId}/settlements`,
      headers: auth(bobTg),
      payload: {
        fromMemberId: bobId,
        toMemberId: aliceId,
        amount: "10.00",
        expenseIds: [carolExpense.id], // bob has no share in this
      },
    });
    expect(res.statusCode).toBe(409);
    expect(res.json().error).toMatch(/not paid by the payee/);
  });

  it("partial pay: expense stays active (gap > tolerance)", async () => {
    // Bob owes 50 on Hotel (100 split 2 ways), gap within tolerance → that one covered.
    // Use a 500.00 expense so Bob owes 250: pay 100 → gap 150 > tolerance → NOT covered.
    await createExpense("200.00", "Hotel");
    const bigExpense = await createExpense("500.00", "BigExpense");
    const payRes = await app.inject({
      method: "POST",
      url: `/api/groups/${groupId}/settlements`,
      headers: auth(bobTg),
      payload: {
        fromMemberId: bobId,
        toMemberId: aliceId,
        amount: "100.00", // bob owes 250, paying 100 → gap 150 > tolerance
        expenseIds: [bigExpense.id],
      },
    });
    expect(payRes.statusCode).toBe(201);

    // BigExpense should still appear in active list (not covered)
    const expRes = await app.inject({
      method: "GET",
      url: `/api/groups/${groupId}/expenses`,
      headers: auth(aliceTg),
    });
    expect(expRes.json<ExpenseDto[]>().find((e) => e.id === bigExpense.id)).toBeDefined();

    // Settle plan should still show Bob → Alice transfer.
    // Accumulated uncovered debts at this point: Lunch 40 + Hotel 100 + BigExpense residual 150 = 290.
    const planRes = await app.inject({
      method: "GET",
      url: `/api/groups/${groupId}/settle`,
      headers: auth(aliceTg),
    });
    const plan = planRes.json<SettlePlanResponse>();
    const transfer = plan.transfers.find(
      (t) => t.fromMemberId === bobId && t.toMemberId === aliceId,
    );
    expect(transfer).toBeDefined();
    expect(Number(transfer!.amount)).toBeCloseTo(290, 0);
  });

  it("settle across two expenses oldest-first", async () => {
    const e1 = await createExpense("100.00", "OlderExpense", "2026-02-01T12:00:00.000Z");
    const e2 = await createExpense("100.00", "NewerExpense", "2026-02-20T12:00:00.000Z");
    // Bob owes 50 on each. Settle 70 → 50 to e1, 20 to e2.
    const res = await app.inject({
      method: "POST",
      url: `/api/groups/${groupId}/settlements`,
      headers: auth(bobTg),
      payload: {
        fromMemberId: bobId,
        toMemberId: aliceId,
        amount: "70.00",
        expenseIds: [e1.id, e2.id],
      },
    });
    expect(res.statusCode).toBe(201);
    const s = res.json<SettlementDto>();
    const allocs = await db
      .select()
      .from(settlementAllocations)
      .where(eq(settlementAllocations.settlementId, s.id));
    // e1 gets 50, e2 gets 20
    const a1 = allocs.find((a) => a.expenseId === e1.id);
    const a2 = allocs.find((a) => a.expenseId === e2.id);
    expect(a1?.allocatedAmount).toBe("50.00");
    expect(a2?.allocatedAmount).toBe("20.00");
  });

  it("addManualMember: two calls produce distinct telegram ids", async () => {
    const m1 = await addManualMember(db, groupId, "Manual1", null);
    const m2 = await addManualMember(db, groupId, "Manual2", null);
    expect(m1.telegramUserId).not.toBe(m2.telegramUserId);
  });

  it("voiding an expense removes its registered settlement amount", async () => {
    const e1 = await createExpense("100.00", "VoidLinkedExpense", "2026-03-01T12:00:00.000Z");
    const e2 = await createExpense("50.00", "KeepLinkedExpense", "2026-03-02T12:00:00.000Z");
    const payRes = await app.inject({
      method: "POST",
      url: `/api/groups/${groupId}/settlements`,
      headers: auth(bobTg),
      payload: {
        fromMemberId: bobId,
        toMemberId: aliceId,
        amount: "75.00",
        expenseIds: [e1.id, e2.id],
      },
    });
    expect(payRes.statusCode).toBe(201);
    const settlement = payRes.json<SettlementDto>();

    const voidRes = await app.inject({
      method: "POST",
      url: `/api/groups/${groupId}/expenses/${e1.id}/void`,
      headers: auth(aliceTg),
    });
    expect(voidRes.statusCode).toBe(200);

    const settlementRows = await db
      .select()
      .from(settlements)
      .where(eq(settlements.id, settlement.id));
    expect(settlementRows).toHaveLength(1);
    expect(settlementRows[0]!.amount).toBe("25.00");
    expect(settlementRows[0]!.expenseIds).toEqual([e2.id]);

    const allocs = await db
      .select()
      .from(settlementAllocations)
      .where(eq(settlementAllocations.settlementId, settlement.id));
    expect(allocs).toHaveLength(1);
    expect(allocs[0]!.expenseId).toBe(e2.id);
    expect(allocs[0]!.allocatedAmount).toBe("25.00");
  });

  it("deleting a settlement removes its allocations", async () => {
    const expense = await createExpense("140.00", "DeleteSettlementExpense");
    const payRes = await app.inject({
      method: "POST",
      url: `/api/groups/${groupId}/settlements`,
      headers: auth(bobTg),
      payload: {
        fromMemberId: bobId,
        toMemberId: aliceId,
        amount: "70.00",
        expenseIds: [expense.id],
      },
    });
    expect(payRes.statusCode).toBe(201);
    const settlement = payRes.json<SettlementDto>();

    const deleteRes = await app.inject({
      method: "DELETE",
      url: `/api/groups/${groupId}/settlements/${settlement.id}`,
      headers: auth(bobTg),
    });
    expect(deleteRes.statusCode).toBe(200);

    const settlementRows = await db
      .select()
      .from(settlements)
      .where(eq(settlements.id, settlement.id));
    expect(settlementRows).toHaveLength(0);
    const allocs = await db
      .select()
      .from(settlementAllocations)
      .where(eq(settlementAllocations.settlementId, settlement.id));
    expect(allocs).toHaveLength(0);
  });

  it("reset clears allocations without FK error", async () => {
    const res = await app.inject({
      method: "POST",
      url: `/api/groups/${groupId}/reset`,
      headers: auth(aliceTg),
    });
    // Alice may not be admin in this test group; promote her first
    if (res.statusCode === 403) {
      // Promote and retry
      await db
        .update(members)
        .set({ role: "admin" })
        .where(eq(members.id, aliceId));
      const res2 = await app.inject({
        method: "POST",
        url: `/api/groups/${groupId}/reset`,
        headers: auth(aliceTg),
      });
      expect(res2.statusCode).toBe(200);
    } else {
      expect(res.statusCode).toBe(200);
    }
    // No allocations should remain
    const remaining = await db
      .select()
      .from(settlementAllocations)
      .innerJoin(settlements, eq(settlementAllocations.settlementId, settlements.id))
      .where(eq(settlements.groupId, groupId));
    expect(remaining).toHaveLength(0);
  });
});
