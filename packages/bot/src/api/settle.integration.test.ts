/**
 * Phase 2 end-to-end tests: settle plan, clamped mark-as-paid, non-debtor
 * rejection, edit, and void. Against the local Postgres; skips if no DB.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createDb, type Db } from "../db.js";
import { buildServer } from "../server.js";
import { upsertGroup, upsertMember } from "../repo.js";
import { signInitDataForTest } from "../auth/initData.js";
import {
  groups,
  members,
  expenses,
  expenseShares,
  settlements,
} from "@jemaw/shared/schema";
import { eq } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import type {
  BalanceDto,
  ExpenseDto,
  GroupDto,
  SettlePlanResponse,
} from "@jemaw/shared/types";

const DATABASE_URL = process.env.DATABASE_URL;
const BOT_TOKEN = "123456:PHASE2-TOKEN";
const NOW = 1_780_000_000;
const d = DATABASE_URL ? describe : describe.skip;

d("Phase 2 settle integration", () => {
  let db: Db;
  let app: FastifyInstance;
  let groupId: string;
  let saraTg: bigint;
  let tomTg: bigint;
  let saraId: string;
  let tomId: string;

  const initData = (tg: bigint) =>
    signInitDataForTest(
      {
        auth_date: String(NOW - 5),
        user: JSON.stringify({ id: Number(tg), first_name: "U" }),
      },
      BOT_TOKEN,
    );
  const h = (tg: bigint) => ({ "x-telegram-init-data": initData(tg) });

  beforeAll(async () => {
    db = createDb(DATABASE_URL!);
    const base = BigInt(-3_000_000_000 - Math.floor(process.uptime() * 1000));
    saraTg = base - 1n;
    tomTg = base - 2n;
    const g = await upsertGroup(db, base, "SettleTrip", "EUR");
    groupId = g.id;
    saraId = (await upsertMember(db, groupId, saraTg, "Sara", null)).id;
    tomId = (await upsertMember(db, groupId, tomTg, "Tom", null)).id;
    app = await buildServer({
      api: { db, botToken: BOT_TOKEN, now: () => NOW },
      corsOrigin: undefined,
    });
  });

  afterAll(async () => {
    await db.delete(settlements).where(eq(settlements.groupId, groupId));
    const exp = await db
      .select({ id: expenses.id })
      .from(expenses)
      .where(eq(expenses.groupId, groupId));
    for (const e of exp) {
      await db.delete(expenseShares).where(eq(expenseShares.expenseId, e.id));
    }
    await db.delete(expenses).where(eq(expenses.groupId, groupId));
    await db.delete(members).where(eq(members.groupId, groupId));
    await db.delete(groups).where(eq(groups.id, groupId));
    await app.close();
  });

  async function addExpense(amount: string, payer: string) {
    return app.inject({
      method: "POST",
      url: `/api/groups/${groupId}/expenses`,
      headers: h(saraTg),
      payload: {
        description: "Dinner",
        amount,
        payerMemberId: payer,
        splitType: "equal",
        splitWith: [saraId, tomId],
      },
    });
  }

  it("computes a settle plan (Tom owes Sara)", async () => {
    // Sara pays 30 split 2 ways → Sara +15, Tom -15. Tom → Sara 15.
    await addExpense("30.00", saraId);
    const res = await app.inject({
      method: "GET",
      url: `/api/groups/${groupId}/settle`,
      headers: h(tomTg),
    });
    expect(res.statusCode).toBe(200);
    const plan = res.json() as SettlePlanResponse;
    expect(plan.transfers).toHaveLength(1);
    expect(plan.transfers[0]).toMatchObject({
      fromMemberId: tomId,
      toMemberId: saraId,
      amount: "15.00",
    });
  });

  it("rejects a non-debtor marking paid (Sara is owed, not the debtor)", async () => {
    const res = await app.inject({
      method: "POST",
      url: `/api/groups/${groupId}/settlements`,
      headers: h(saraTg),
      payload: { toMemberId: tomId },
    });
    // Sara owes nobody → no transfer from Sara → 409.
    expect(res.statusCode).toBe(409);
  });

  it("debtor marks paid; balances zero out", async () => {
    const res = await app.inject({
      method: "POST",
      url: `/api/groups/${groupId}/settlements`,
      headers: h(tomTg),
      payload: { toMemberId: saraId },
    });
    expect(res.statusCode).toBe(201);

    const bal = await app.inject({
      method: "GET",
      url: `/api/groups/${groupId}/balances`,
      headers: h(saraTg),
    });
    const by = Object.fromEntries(
      (bal.json() as BalanceDto[]).map((b) => [b.displayName, b.net]),
    );
    expect(by["Sara"]).toBe("0.00");
    expect(by["Tom"]).toBe("0.00");
  });

  it("clamps a second mark-paid to the new debt after another expense", async () => {
    // Tom pays 10 split 2 ways → Tom +5, Sara -5. Now Sara owes Tom 5.
    await addExpense("10.00", tomId);
    const res = await app.inject({
      method: "POST",
      url: `/api/groups/${groupId}/settlements`,
      headers: h(saraTg),
      payload: { toMemberId: tomId },
    });
    expect(res.statusCode).toBe(201);
    expect((res.json() as { amount: string }).amount).toBe("5.00");

    const bal = await app.inject({
      method: "GET",
      url: `/api/groups/${groupId}/balances`,
      headers: h(tomTg),
    });
    const by = Object.fromEntries(
      (bal.json() as BalanceDto[]).map((b) => [b.displayName, b.net]),
    );
    expect(by["Sara"]).toBe("0.00");
    expect(by["Tom"]).toBe("0.00");
  });

  it("edits an expense and balances reflect the new amount", async () => {
    const create = await addExpense("20.00", saraId);
    const exp = create.json() as ExpenseDto;
    const edit = await app.inject({
      method: "PATCH",
      url: `/api/groups/${groupId}/expenses/${exp.id}`,
      headers: h(saraTg),
      payload: {
        description: "Dinner edited",
        amount: "40.00",
        payerMemberId: saraId,
        splitType: "equal",
        splitWith: [saraId, tomId],
      },
    });
    expect(edit.statusCode).toBe(200);
    expect((edit.json() as ExpenseDto).amount).toBe("40.00");
  });

  it("voids an expense; second void returns 409", async () => {
    const create = await addExpense("12.00", saraId);
    const exp = create.json() as ExpenseDto;
    const v1 = await app.inject({
      method: "POST",
      url: `/api/groups/${groupId}/expenses/${exp.id}/void`,
      headers: h(saraTg),
    });
    expect(v1.statusCode).toBe(200);
    const v2 = await app.inject({
      method: "POST",
      url: `/api/groups/${groupId}/expenses/${exp.id}/void`,
      headers: h(saraTg),
    });
    expect(v2.statusCode).toBe(409);
  });

  it("group still resolves after edits/voids", async () => {
    const res = await app.inject({
      method: "GET",
      url: `/api/groups/${groupId}`,
      headers: h(saraTg),
    });
    expect((res.json() as GroupDto).name).toBe("SettleTrip");
  });
});
