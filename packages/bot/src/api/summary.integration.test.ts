/**
 * me/summary + currency PATCH integration. Skips without DATABASE_URL.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createDb, type Db } from "../db.js";
import { buildServer } from "../server.js";
import { upsertGroup, upsertMember } from "../repo.js";
import { signInitDataForTest } from "../auth/initData.js";
import { groups, members, expenses, expenseShares } from "@jemaw/shared/schema";
import { eq } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import type { MeSummaryDto, GroupDto } from "@jemaw/shared/types";

const DATABASE_URL = process.env.DATABASE_URL;
const BOT_TOKEN = "123456:SUMMARY-TOKEN";
const NOW = 1_780_000_000;
const d = DATABASE_URL ? describe : describe.skip;

d("me/summary + currency PATCH", () => {
  let db: Db;
  let app: FastifyInstance;
  let groupId: string;
  let saraTg: bigint;
  let saraId: string;
  let tomId: string;

  const h = (tg: bigint) => ({
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
    const base = BigInt(-6_000_000_000 - Math.floor(process.uptime() * 1000));
    saraTg = base - 1n;
    const g = await upsertGroup(db, base, "SumTrip", "EUR");
    groupId = g.id;
    saraId = (await upsertMember(db, groupId, saraTg, "Sara", null)).id;
    tomId = (await upsertMember(db, groupId, base - 2n, "Tom", null)).id;
    app = await buildServer({
      api: { db, botToken: BOT_TOKEN, now: () => NOW },
      corsOrigin: undefined,
    });
  });

  afterAll(async () => {
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

  it("allows currency change before any expenses", async () => {
    const res = await app.inject({
      method: "PATCH",
      url: `/api/groups/${groupId}`,
      headers: h(saraTg),
      payload: { defaultCurrency: "usd" },
    });
    expect(res.statusCode).toBe(200);
    expect((res.json() as GroupDto).defaultCurrency).toBe("USD");
  });

  it("computes me/summary after an expense", async () => {
    // Sara pays 30 split 2 ways → Sara: paid 30, share 15, net +15.
    await app.inject({
      method: "POST",
      url: `/api/groups/${groupId}/expenses`,
      headers: h(saraTg),
      payload: {
        description: "Dinner",
        amount: "30.00",
        payerMemberId: saraId,
        splitType: "equal",
        splitWith: [saraId, tomId],
      },
    });
    const res = await app.inject({
      method: "GET",
      url: `/api/groups/${groupId}/me/summary`,
      headers: h(saraTg),
    });
    expect(res.statusCode).toBe(200);
    const s = res.json() as MeSummaryDto;
    expect(s.totalPaid).toBe("30.00");
    expect(s.totalShare).toBe("15.00");
    expect(s.net).toBe("15.00");
    expect(s.expenseCount).toBe(1);
  });

  it("rejects currency change once expenses exist (409)", async () => {
    const res = await app.inject({
      method: "PATCH",
      url: `/api/groups/${groupId}`,
      headers: h(saraTg),
      payload: { defaultCurrency: "GBP" },
    });
    expect(res.statusCode).toBe(409);
  });
});
