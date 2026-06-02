/**
 * End-to-end API test against the local Postgres. Proves auth hook + routes +
 * domain split/balance logic + DB all work together.
 *
 * Skips automatically if DATABASE_URL is unset (e.g. CI without a DB).
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createDb, type Db } from "../db.js";
import { buildServer } from "../server.js";
import { upsertGroup, upsertMember } from "../repo.js";
import { signInitDataForTest } from "../auth/initData.js";
import { groups, members, expenses, expenseShares } from "@jemaw/shared/schema";
import { eq } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import type { BalanceDto, ExpenseDto, GroupDto } from "@jemaw/shared/types";

const DATABASE_URL = process.env.DATABASE_URL;
const BOT_TOKEN = "123456:INTEGRATION-TOKEN";
const NOW = 1_780_000_000;

const d = DATABASE_URL ? describe : describe.skip;

d("API integration", () => {
  let db: Db;
  let app: FastifyInstance;
  let groupId: string;
  let chatId: bigint;
  let saraTgId: bigint;
  let tomTgId: bigint;
  let saraMemberId: string;
  let tomMemberId: string;

  function initDataFor(tgUserId: bigint): string {
    return signInitDataForTest(
      {
        auth_date: String(NOW - 5),
        user: JSON.stringify({ id: Number(tgUserId), first_name: "U" }),
      },
      BOT_TOKEN,
    );
  }

  beforeAll(async () => {
    db = createDb(DATABASE_URL!);
    // Unique chat id per run window via uptime (no Date.now in tests is fine).
    chatId = BigInt(-1_000_000_000 - Math.floor(process.uptime() * 1000));
    saraTgId = chatId - 1n;
    tomTgId = chatId - 2n;

    const g = await upsertGroup(db, chatId, "Trip", "EUR");
    groupId = g.id;
    const sara = await upsertMember(db, groupId, saraTgId, "Sara", "sara");
    const tom = await upsertMember(db, groupId, tomTgId, "Tom", "tom");
    saraMemberId = sara.id;
    tomMemberId = tom.id;

    app = await buildServer({
      api: { db, botToken: BOT_TOKEN, now: () => NOW, scanLimiter: { tryAcquire: () => true } as never },
      corsOrigin: undefined,
    });
  });

  afterAll(async () => {
    // Clean up rows created by this test.
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

  it("rejects a non-member's initData with 403", async () => {
    const res = await app.inject({
      method: "GET",
      url: `/api/groups/${groupId}`,
      headers: { "x-telegram-init-data": initDataFor(999_999n) },
    });
    expect(res.statusCode).toBe(403);
  });

  it("returns the group with members for a valid member", async () => {
    const res = await app.inject({
      method: "GET",
      url: `/api/groups/${groupId}`,
      headers: { "x-telegram-init-data": initDataFor(saraTgId) },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json() as GroupDto;
    expect(body.name).toBe("Trip");
    expect(body.members.map((m) => m.displayName).sort()).toEqual([
      "Sara",
      "Tom",
    ]);
  });

  it("creates an equal-split expense and reflects it in balances", async () => {
    const create = await app.inject({
      method: "POST",
      url: `/api/groups/${groupId}/expenses`,
      headers: { "x-telegram-init-data": initDataFor(saraTgId) },
      payload: {
        description: "Dinner",
        amount: "30.00",
        payerMemberId: saraMemberId,
        splitType: "equal",
        splitWith: [saraMemberId, tomMemberId],
      },
    });
    expect(create.statusCode).toBe(201);
    const expense = create.json() as ExpenseDto;
    expect(expense.amount).toBe("30.00");
    expect(expense.shares).toHaveLength(2);

    const bal = await app.inject({
      method: "GET",
      url: `/api/groups/${groupId}/balances`,
      headers: { "x-telegram-init-data": initDataFor(tomTgId) },
    });
    const balances = bal.json() as BalanceDto[];
    const by = Object.fromEntries(balances.map((b) => [b.displayName, b.net]));
    // Sara paid 30, owes 15 → +15.00; Tom owes 15 → -15.00
    expect(by["Sara"]).toBe("15.00");
    expect(by["Tom"]).toBe("-15.00");
  });

  it("rejects an exact split that doesn't sum to total", async () => {
    const res = await app.inject({
      method: "POST",
      url: `/api/groups/${groupId}/expenses`,
      headers: { "x-telegram-init-data": initDataFor(saraTgId) },
      payload: {
        description: "Bad exact",
        amount: "10.00",
        payerMemberId: saraMemberId,
        splitType: "exact",
        splitWith: [saraMemberId, tomMemberId],
        exact: { [saraMemberId]: "7.00", [tomMemberId]: "2.00" },
      },
    });
    expect(res.statusCode).toBe(400);
  });
});
