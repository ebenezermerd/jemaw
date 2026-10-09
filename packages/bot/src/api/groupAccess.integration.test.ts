/**
 * Group access set from the admin console: a suspended group only exposes its
 * own record to the mini app, and AI calls count toward a daily limit. Local
 * Postgres; skips without DATABASE_URL.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { eq } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { aiRuns, botReplies, groups, members } from "@jemaw/shared/schema";
import type { GroupDto } from "@jemaw/shared/types";
import { createDb, type Db } from "../db.js";
import { buildServer } from "../server.js";
import { getGroupById, groupAiGate, upsertGroup, upsertMember } from "../repo.js";
import { signInitDataForTest } from "../auth/initData.js";

const DATABASE_URL = process.env.DATABASE_URL;
const BOT_TOKEN = "123456:ACCESS-TOKEN";
const NOW = 1_780_000_000;
const d = DATABASE_URL ? describe : describe.skip;

d("group access", () => {
  let db: Db;
  let app: FastifyInstance;
  let groupId: string;
  let tg: bigint;

  const h = () => ({
    "x-telegram-init-data": signInitDataForTest(
      { auth_date: String(NOW - 5), user: JSON.stringify({ id: Number(tg), first_name: "U" }) },
      BOT_TOKEN,
    ),
  });
  const setAccess = (access: Record<string, unknown>) =>
    db.update(groups).set({ settings: { access } }).where(eq(groups.id, groupId));

  beforeAll(async () => {
    db = createDb(DATABASE_URL!);
    const base = BigInt(-4_000_000_000 - Math.floor(process.uptime() * 1000));
    tg = base - 1n;
    groupId = (await upsertGroup(db, base, "AccessGroup", "ETB")).id;
    await upsertMember(db, groupId, tg, "Ada", null);
    app = await buildServer({
      api: {
        db,
        botToken: BOT_TOKEN,
        now: () => NOW,
        scanLimiter: { tryAcquire: () => true } as never,
        gemini: { suggest: async () => ({ json: {} }) },
      },
      corsOrigin: undefined,
    });
  });

  afterAll(async () => {
    await app?.close();
    if (!db) return;
    await db.delete(botReplies).where(eq(botReplies.groupId, groupId));
    await db.delete(aiRuns).where(eq(aiRuns.groupId, groupId));
    await db.delete(members).where(eq(members.groupId, groupId));
    await db.delete(groups).where(eq(groups.id, groupId));
  });

  it("lets a suspended group's members read why, and closes everything else", async () => {
    await setAccess({ status: "suspended", reason: "Payment overdue", until: "2099-01-01T00:00:00.000Z" });
    const group = await app.inject({ method: "GET", url: `/api/groups/${groupId}`, headers: h() });
    expect(group.statusCode).toBe(200);
    expect((group.json() as GroupDto).access).toMatchObject({ status: "suspended", reason: "Payment overdue" });
    const balances = await app.inject({ method: "GET", url: `/api/groups/${groupId}/balances`, headers: h() });
    expect(balances.statusCode).toBe(423);
    await setAccess({ status: "active" });
    const open = await app.inject({ method: "GET", url: `/api/groups/${groupId}/balances`, headers: h() });
    expect(open.statusCode).toBe(200);
  });

  it("counts scans and model replies, not template replies, toward the daily AI limit", async () => {
    await setAccess({ status: "active", aiDailyLimit: 2 });
    await db.insert(aiRuns).values({ groupId, triggerType: "keyword", fromMessageId: 1n, toMessageId: 2n, status: "success" });
    await db.insert(botReplies).values([
      { groupId, triggerEvent: "direct_chat", channel: "group", decision: "sent", model: null },
    ]);
    let gate = await groupAiGate(db, (await getGroupById(db, groupId))!);
    expect(gate).toMatchObject({ aiCallsToday: 1, blocked: null });
    await db.insert(botReplies).values({ groupId, triggerEvent: "direct_chat", channel: "group", decision: "sent", model: "m" });
    gate = await groupAiGate(db, (await getGroupById(db, groupId))!);
    expect(gate).toMatchObject({ aiCallsToday: 2, blocked: "limit" });
    const scan = await app.inject({ method: "POST", url: `/api/groups/${groupId}/scan`, headers: h() });
    expect(scan.statusCode).toBe(503);
    expect(scan.json().error).toContain("today's AI allowance");
  });
});
