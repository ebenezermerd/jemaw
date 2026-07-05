/**
 * Integration tests for admin member removal: the data summary endpoint and
 * DELETE semantics (hard delete when unreferenced, deactivate with history).
 *
 * Skips automatically if DATABASE_URL is unset (e.g. CI without a DB).
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createDb, type Db } from "../db.js";
import { buildServer } from "../server.js";
import {
  upsertGroup,
  upsertMember,
  addManualMember,
  setMemberRole,
} from "../repo.js";
import { signInitDataForTest } from "../auth/initData.js";
import {
  groups,
  members,
  expenses,
  expenseShares,
} from "@jemaw/shared/schema";
import { eq } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import type {
  MemberDto,
  MemberDataSummaryDto,
  RemoveMemberResponse,
} from "@jemaw/shared/types";

const DATABASE_URL = process.env.DATABASE_URL;
const BOT_TOKEN = "123456:INTEGRATION-TOKEN";
const NOW = 1_780_000_000;

const d = DATABASE_URL ? describe : describe.skip;

d("Member removal API", () => {
  let db: Db;
  let app: FastifyInstance;
  let groupId: string;
  let chatId: bigint;
  let adminTgId: bigint;
  let bobTgId: bigint;
  let adminMemberId: string;
  let bobMemberId: string;
  let manualMemberId: string;

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
    chatId = BigInt(-3_000_000_000 - Math.floor(process.uptime() * 1000));
    adminTgId = -chatId + 1n;
    bobTgId = -chatId + 2n;

    const g = await upsertGroup(db, chatId, "Removal", "ETB");
    groupId = g.id;
    const admin = await upsertMember(db, groupId, adminTgId, "Admin", "admin");
    const bob = await upsertMember(db, groupId, bobTgId, "Bob", "bob");
    const manual = await addManualMember(db, groupId, "Ghost", null);
    adminMemberId = admin.id;
    bobMemberId = bob.id;
    manualMemberId = manual.id;
    await setMemberRole(db, groupId, adminTgId, "admin");

    app = await buildServer({
      api: {
        db,
        botToken: BOT_TOKEN,
        now: () => NOW,
        scanLimiter: { tryAcquire: () => true } as never,
      },
      corsOrigin: undefined,
    });

    // Admin fronts 60.00 split with Bob, so Bob carries ledger history.
    const created = await app.inject({
      method: "POST",
      url: `/api/groups/${groupId}/expenses`,
      headers: { "x-telegram-init-data": initDataFor(adminTgId) },
      payload: {
        description: "Dinner",
        amount: "60.00",
        payerMemberId: adminMemberId,
        splitType: "equal",
        splitWith: [adminMemberId, bobMemberId],
      },
    });
    expect(created.statusCode).toBe(201);
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

  it("summarizes a member's kpis, expenses, and settlements for admins", async () => {
    const res = await app.inject({
      method: "GET",
      url: `/api/groups/${groupId}/members/${bobMemberId}/summary`,
      headers: { "x-telegram-init-data": initDataFor(adminTgId) },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json() as MemberDataSummaryDto;
    expect(body.member.id).toBe(bobMemberId);
    expect(body.kpis.totalShare).toBe("30.00");
    expect(body.kpis.totalPaid).toBe("0.00");
    expect(body.kpis.net).toBe("-30.00");
    expect(body.kpis.outstandingOwes).toBe("30.00");
    expect(body.kpis.expenseCount).toBe(1);
    expect(body.expenses[0]!.description).toBe("Dinner");
    expect(body.expenses[0]!.role).toBe("participant");
    expect(body.settlements).toEqual([]);
  });

  it("rejects the summary and removal for non admins", async () => {
    const sumRes = await app.inject({
      method: "GET",
      url: `/api/groups/${groupId}/members/${bobMemberId}/summary`,
      headers: { "x-telegram-init-data": initDataFor(bobTgId) },
    });
    expect(sumRes.statusCode).toBe(403);
    const delRes = await app.inject({
      method: "DELETE",
      url: `/api/groups/${groupId}/members/${manualMemberId}`,
      headers: { "x-telegram-init-data": initDataFor(bobTgId) },
    });
    expect(delRes.statusCode).toBe(403);
  });

  it("blocks removing yourself", async () => {
    const res = await app.inject({
      method: "DELETE",
      url: `/api/groups/${groupId}/members/${adminMemberId}`,
      headers: { "x-telegram-init-data": initDataFor(adminTgId) },
    });
    expect(res.statusCode).toBe(409);
  });

  it("hard deletes a member with no ledger history", async () => {
    const res = await app.inject({
      method: "DELETE",
      url: `/api/groups/${groupId}/members/${manualMemberId}`,
      headers: { "x-telegram-init-data": initDataFor(adminTgId) },
    });
    expect(res.statusCode).toBe(200);
    expect((res.json() as RemoveMemberResponse).removed).toBe("deleted");
    const rows = await db
      .select({ id: members.id })
      .from(members)
      .where(eq(members.id, manualMemberId));
    expect(rows).toEqual([]);
  });

  it("deactivates a member with ledger history and locks them out", async () => {
    const res = await app.inject({
      method: "DELETE",
      url: `/api/groups/${groupId}/members/${bobMemberId}`,
      headers: { "x-telegram-init-data": initDataFor(adminTgId) },
    });
    expect(res.statusCode).toBe(200);
    expect((res.json() as RemoveMemberResponse).removed).toBe("deactivated");

    const groupRes = await app.inject({
      method: "GET",
      url: `/api/groups/${groupId}`,
      headers: { "x-telegram-init-data": initDataFor(adminTgId) },
    });
    const bob = (groupRes.json() as { members: MemberDto[] }).members.find(
      (m) => m.id === bobMemberId,
    )!;
    expect(bob.isActive).toBe(false);
    expect(bob.isPrimary).toBe(false);

    // The removed member can no longer call the API.
    const bobRes = await app.inject({
      method: "GET",
      url: `/api/groups/${groupId}`,
      headers: { "x-telegram-init-data": initDataFor(bobTgId) },
    });
    expect(bobRes.statusCode).toBe(403);
  });

  it("accepts a bodyless delete that still carries a json content type", async () => {
    // Browsers send content-type: application/json on bodyless DELETEs from
    // older app shells; the default parser rejected that with FST_ERR_CTP_EMPTY_JSON_BODY.
    const extra = await addManualMember(db, groupId, "Bodyless", null);
    const res = await app.inject({
      method: "DELETE",
      url: `/api/groups/${groupId}/members/${extra.id}`,
      headers: {
        "x-telegram-init-data": initDataFor(adminTgId),
        "content-type": "application/json",
      },
    });
    expect(res.statusCode).toBe(200);
    expect((res.json() as RemoveMemberResponse).removed).toBe("deleted");
  });

  it("keeps the removed debtor on the balance board until square", async () => {
    const res = await app.inject({
      method: "GET",
      url: `/api/groups/${groupId}/balances`,
      headers: { "x-telegram-init-data": initDataFor(adminTgId) },
    });
    const nets = res.json() as { memberId: string; net: string }[];
    const bob = nets.find((n) => n.memberId === bobMemberId);
    expect(bob?.net).toBe("-30.00");
  });
});
