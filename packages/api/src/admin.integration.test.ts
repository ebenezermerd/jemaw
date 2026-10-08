/**
 * Console management routes against the local Postgres, through Fastify
 * inject with a fake token verifier and a fake Telegram client. Skips without
 * DATABASE_URL. Everything it creates is removed afterwards.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { eq, inArray } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import {
  groups,
  members,
  expenses,
  expenseShares,
  settlements,
  aiRuns,
  suggestions,
  botReplies,
  messages,
  announcements,
  appConfig,
  adminAuditLog,
} from "@jemaw/shared/schema";
import { createDb, type Db } from "./db.js";
import { buildServer } from "./server.js";
import type { TelegramClient } from "./telegram.js";

const DATABASE_URL = process.env.DATABASE_URL;
const d = DATABASE_URL ? describe : describe.skip;

const ADMIN = "itest-admin@jemaw.test";
const calls: { method: string; params: Record<string, unknown> }[] = [];
const telegram: TelegramClient = {
  configured: true,
  async call<T>(method: string, params: Record<string, unknown> = {}) {
    calls.push({ method, params });
    if (method === "sendMessage" && params.chat_id === "999") return { ok: false, error: "chat not found" };
    return { ok: true, result: { username: "JemawBot" } as T };
  },
};

d("admin management routes", () => {
  let db: Db;
  let app: FastifyInstance;
  let savedAdmins: unknown;
  let groupId: string;
  let otherGroupId: string;
  let adminId: string;
  let memberId: string;
  const chatId = BigInt(-1_000_000_000_000 - Math.floor(Math.random() * 1e6));

  const inject = (method: "GET" | "POST" | "PATCH" | "DELETE", url: string, payload?: unknown) =>
    app.inject({ method, url, payload: payload as never, headers: { authorization: "Bearer t" } });

  beforeAll(async () => {
    db = createDb({ databaseUrl: DATABASE_URL! });
    const [row] = await db.select().from(appConfig).where(eq(appConfig.key, "admins"));
    savedAdmins = row?.value;
    await db
      .insert(appConfig)
      .values({ key: "admins", value: { emails: [ADMIN] } })
      .onConflictDoUpdate({ target: appConfig.key, set: { value: { emails: [ADMIN] } } });

    const [g] = await db
      .insert(groups)
      .values({ telegramChatId: chatId, name: "ITest Group", defaultCurrency: "ETB", settings: { vibe: { keep: 1 } } })
      .returning();
    groupId = g!.id;
    const [g2] = await db
      .insert(groups)
      .values({ telegramChatId: chatId - 1n, name: "ITest Empty", defaultCurrency: "ETB" })
      .returning();
    otherGroupId = g2!.id;
    const [a, m] = await db
      .insert(members)
      .values([
        { groupId, telegramUserId: 9_100_001n, displayName: "Ada", role: "admin" },
        { groupId, telegramUserId: 9_100_002n, displayName: "Bo", role: "member" },
      ])
      .returning();
    adminId = a!.id;
    memberId = m!.id;
    const [run] = await db
      .insert(aiRuns)
      .values({ groupId, triggerType: "keyword", fromMessageId: 1n, toMessageId: 2n, status: "success" })
      .returning();
    const [sug] = await db
      .insert(suggestions)
      .values({
        groupId,
        aiRunId: run!.id,
        confidence: "0.90",
        description: "Lunch",
        amount: "100.00",
        splitType: "equal",
        splitWith: [],
        evidenceMessageIds: [],
        reasoning: "said so",
        status: "confirmed",
      })
      .returning();
    const [e] = await db
      .insert(expenses)
      .values({
        groupId,
        payerMemberId: adminId,
        createdByMemberId: adminId,
        description: "Lunch",
        amount: "100.00",
        currency: "ETB",
        source: "ai_confirmed",
        sourceSuggestionId: sug!.id,
        occurredAt: new Date(),
      })
      .returning();
    await db.insert(expenseShares).values([
      { expenseId: e!.id, memberId: adminId, shareAmount: "50.00" },
      { expenseId: e!.id, memberId: memberId, shareAmount: "50.00" },
    ]);
    await db
      .insert(settlements)
      .values({ groupId, fromMemberId: memberId, toMemberId: adminId, amount: "20.00", currency: "ETB" });
    await db.insert(botReplies).values({ groupId, triggerEvent: "direct_chat", channel: "group", decision: "suppressed", suppressionReason: "cooldown" });
    await db.insert(messages).values({ groupId, telegramMessageId: 5n, senderTelegramUserId: 9_100_001n, text: "hi", sentAt: new Date() });

    app = await buildServer({
      api: {
        db,
        verifier: { verify: async () => ({ uid: "itest", email: ADMIN }) },
        now: () => Date.now(),
        telegram,
      },
      corsOrigin: undefined,
    });
  });

  afterAll(async () => {
    await app?.close();
    if (!db) return;
    await db
      .update(appConfig)
      .set({ value: savedAdmins ?? { emails: [] } })
      .where(eq(appConfig.key, "admins"));
    await db.delete(adminAuditLog).where(eq(adminAuditLog.actorUid, "itest"));
    await db.delete(announcements).where(eq(announcements.createdByUid, "itest"));
    // Whatever the delete test left behind.
    const ids = [groupId, otherGroupId].filter(Boolean);
    const { deleteGroupCascade } = await import("./groupAdmin.js");
    for (const id of ids) {
      const [still] = await db.select().from(groups).where(eq(groups.id, id));
      if (still) await deleteGroupCascade(db, id);
    }
  });

  it("refuses a currency change once expenses exist, but renames and syncs Telegram", async () => {
    const locked = await inject("PATCH", `/api/admin/groups/${groupId}`, { defaultCurrency: "usd" });
    expect(locked.statusCode).toBe(409);
    const renamed = await inject("PATCH", `/api/admin/groups/${groupId}`, { name: "ITest Renamed" });
    expect(renamed.statusCode).toBe(200);
    expect(renamed.json()).toMatchObject({ group: { name: "ITest Renamed" }, telegramSynced: true });
    expect(calls.at(-1)).toMatchObject({ method: "setChatTitle", params: { title: "ITest Renamed" } });
    const free = await inject("PATCH", `/api/admin/groups/${otherGroupId}`, { defaultCurrency: "usd" });
    expect(free.json().group.defaultCurrency).toBe("USD");
  });

  it("updates bot settings without touching other settings keys", async () => {
    const res = await inject("PATCH", `/api/admin/groups/${groupId}/humor`, { mode: "roast", ledgerBanter: false });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ mode: "roast", ledgerBanter: false });
    const [g] = await db.select().from(groups).where(eq(groups.id, groupId));
    expect((g!.settings as Record<string, unknown>).vibe).toEqual({ keep: 1 });
    const detail = await inject("GET", `/api/admin/groups/${groupId}`);
    expect(detail.json().settings).toMatchObject({ currencyLocked: true, humor: { mode: "roast" } });
  });

  it("keeps the last admin", async () => {
    const res = await inject("PATCH", `/api/admin/groups/${groupId}/members/${adminId}`, { role: "member" });
    expect(res.statusCode).toBe(409);
    const promote = await inject("PATCH", `/api/admin/groups/${groupId}/members/${memberId}`, { role: "admin" });
    expect(promote.statusCode).toBe(200);
    const demote = await inject("PATCH", `/api/admin/groups/${groupId}/members/${adminId}`, { role: "member" });
    expect(demote.statusCode).toBe(200);
  });

  it("feeds scans, replies, drafts, settlements and console actions into activity", async () => {
    const all = await inject("GET", `/api/admin/activity?groupId=${groupId}&limit=50`);
    const body = all.json();
    const sources = new Set(body.items.map((i: { source: string }) => i.source));
    expect([...sources].sort()).toEqual(["console", "draft", "reply", "scan", "settlement"]);
    expect(body.total).toBe(body.items.length);
    const warn = await inject("GET", `/api/admin/activity?groupId=${groupId}&severity=warn`);
    expect(warn.json().items[0].summary).toBe("Stayed quiet: cooldown");
    const paged = await inject("GET", `/api/admin/activity?groupId=${groupId}&limit=2&offset=2`);
    expect(paged.json()).toMatchObject({ total: body.total });
    expect(paged.json().items).toHaveLength(2);
  });

  it("sends an announcement and records who got it", async () => {
    const created = await inject("POST", "/api/admin/announcements", {
      title: "Hi <all>",
      body: "News",
      audience: "group",
      targetId: groupId,
    });
    expect(created.json().status).toBe("draft");
    const id = created.json().id;
    const sent = await inject("POST", `/api/admin/announcements/${id}/send`);
    expect(sent.statusCode).toBe(200);
    await new Promise((r) => setTimeout(r, 300));
    const [row] = await db.select().from(announcements).where(eq(announcements.id, id));
    expect(row!.status).toBe("sent");
    expect(row!.stats).toMatchObject({ delivered: 1, failed: 0 });
    const msg = calls.find((c) => c.method === "sendMessage" && c.params.chat_id === chatId.toString());
    expect(msg?.params.text).toBe("<b>Hi &lt;all&gt;</b>\n\nNews");

    const toUser = await inject("POST", "/api/admin/announcements", {
      title: "Hey",
      body: "x",
      audience: "user",
      targetId: "999",
      queue: true,
    });
    await new Promise((r) => setTimeout(r, 300));
    const [failed] = await db.select().from(announcements).where(eq(announcements.id, toUser.json().id));
    expect(failed!.status).toBe("failed");
    const del = await inject("DELETE", `/api/admin/announcements/${toUser.json().id}`);
    expect(del.statusCode).toBe(200);
  });

  it("deletes a group with all its data after the name is confirmed, and leaves the chat", async () => {
    const wrong = await inject("DELETE", `/api/admin/groups/${groupId}`, { confirmName: "nope" });
    expect(wrong.statusCode).toBe(400);
    const res = await inject("DELETE", `/api/admin/groups/${groupId}`, { confirmName: "ITest Renamed" });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({
      leftChat: true,
      deleted: { groups: 1, members: 2, expenses: 1, expense_shares: 2, settlements: 1, suggestions: 1, ai_runs: 1, bot_replies: 1, messages: 1 },
    });
    expect(calls.at(-1)).toMatchObject({ method: "leaveChat", params: { chat_id: chatId.toString() } });
    const left = await db.select().from(members).where(inArray(members.id, [adminId, memberId]));
    expect(left).toHaveLength(0);
  });
});
