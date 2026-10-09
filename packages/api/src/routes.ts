/**
 * Admin REST API. All routes live under /api/admin and run behind the Firebase
 * auth hook, which attaches req.admin. Bodies are validated with zod.
 */
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { Db } from "./db.js";
import { makeAuthHook, type AuthDeps } from "./auth/authHook.js";
import { centsToDecimal } from "@jemaw/shared/types";
import type {
  AdminMeDto,
  AdminPublicStatsDto,
  AdminOverviewDto,
  AdminUserDto,
  AdminGroupDto,
  AdminGroupDetailDto,
  AdminExpensePageDto,
  AdminUserDetailDto,
  AdminAuditEntryDto,
  AnnouncementDto,
  AppConfigDto,
} from "@jemaw/shared/types";
import {
  listUsers,
  setUserActive,
  listAudit,
  writeAudit,
  listAnnouncements,
  createAnnouncement,
  listConfig,
  setConfig,
  getAdmins,
  aiCallsByGroupSince,
  countDistinctUsers,
  countActiveGroups,
  sumLiveExpensesCents,
  countSettlementsSince,
  activitySeries,
  recentActivity,
  topGroupsByVolume,
} from "./repo.js";
import { groups, members } from "@jemaw/shared/schema";
import { eq } from "drizzle-orm";
import {
  groupDetail,
  groupSummary,
  listExpensePage,
  loadGroupLedger,
  membershipOf,
  type GroupLedger,
} from "./ledger.js";
import {
  setGroupAccess,
  getGroup,
  groupHasAnyExpense,
  patchGroupHumor,
  resetGroupLedger,
  updateGroupFields,
  updateGroupMember,
} from "./groupAdmin.js";
import { ACTIVITY_SEVERITIES, ACTIVITY_SOURCES, listActivity } from "./activity.js";
import { deliverAnnouncement } from "./announce.js";
import { botStatus } from "./botStatus.js";
import { aiUsage, checkGroqLimits, DEFAULT_GROQ_MODEL } from "./aiUsage.js";
import { aiDayStart } from "@jemaw/shared/groupAccess";
import type { TelegramClient } from "./telegram.js";
import { announcements } from "@jemaw/shared/schema";
import { and, inArray } from "drizzle-orm";
import {
  BOT_RUNTIME_KEYS,
  parseRuntimeValue,
  runtimeConfigFromRows,
  type BotRuntimeConfig,
} from "@jemaw/shared/runtimeConfig";
import type {
  AdminAccountsDto,
  AdminAiUsageDto,
  AdminActivityPageDto,
  AdminActivitySeverity,
  AdminActivitySource,
  AdminBotStatusDto,
  UpdateGroupResultDto,
} from "@jemaw/shared/types";
import {
  toUserDto,
  toTopGroupDto,
  toAuditDto,
  toAnnouncementDto,
} from "./mappers.js";

export interface ApiDeps {
  db: Db;
  verifier: import("./auth/firebase.js").TokenVerifier;
  now: () => number;
  /** Bot API client for announcements, chat renames and leaving chats. */
  telegram: TelegramClient;
  /** Groq key and default model, for the AI usage limits check. */
  groq?: { apiKey?: string; model?: string };
}

const createAnnouncementSchema = z.object({
  title: z.string().min(1).max(120),
  body: z.string().min(1).max(4000),
  audience: z.enum(["all_groups", "group", "user"]),
  targetId: z.string().optional(),
  queue: z.boolean().optional().default(false),
});

const updateGroupSchema = z
  .object({
    name: z.string().trim().min(1).max(80).optional(),
    defaultCurrency: z
      .string()
      .trim()
      .regex(/^[A-Za-z]{3}$/, "three-letter currency code")
      .transform((c) => c.toUpperCase())
      .optional(),
  })
  .strict();

const updateMemberSchema = z
  .object({
    role: z.enum(["admin", "member"]).optional(),
    isActive: z.boolean().optional(),
    displayName: z.string().trim().min(1).max(60).optional(),
  })
  .strict();

const adminAccountSchema = z.object({
  email: z.string().trim().toLowerCase().email().max(200),
  role: z.enum(["super", "admin"]),
});

const groupAccessSchema = z
  .object({
    status: z.enum(["active", "ai_paused", "suspended"]).optional(),
    until: z.string().datetime({ offset: true }).nullable().optional(),
    reason: z.string().trim().max(300).nullable().optional(),
    aiDailyLimit: z.number().int().min(0).max(10_000).nullable().optional(),
  })
  .strict();

const botConfigSchema = z
  .object({
    scanEnabled: z.boolean(),
    chatEnabled: z.boolean(),
    model: z.string().max(120).nullable(),
    scanCooldownSeconds: z.number().int().min(5).max(600),
    weeklyDigestEnabled: z.boolean(),
    maintenanceMessage: z.string().max(500).nullable(),
  })
  .partial()
  .strict();

const updateConfigSchema = z.object({
  key: z.string().min(1).max(120),
  value: z.unknown(),
});

export async function registerApi(
  app: FastifyInstance,
  deps: ApiDeps,
): Promise<void> {
  const { db, now, telegram } = deps;
  const audit = (
    req: { admin?: { uid: string; email: string | null } },
    action: string,
    targetType: string,
    targetId: string,
    detail: Record<string, unknown> = {},
  ) =>
    writeAudit(db, {
      actorUid: req.admin!.uid,
      actorEmail: req.admin!.email,
      action,
      targetType,
      targetId,
      detail,
    });
  /** Send in the background; the row's status tells the console how it went. */
  const sendInBackground = (id: string) =>
    void deliverAnnouncement(db, telegram, id).catch((err) =>
      console.warn(`[announce] ${id} failed:`, err instanceof Error ? err.message : err),
    );
  const authDeps: AuthDeps = { db, verifier: deps.verifier };
  const auth = makeAuthHook(authDeps);

  // ─── public ────────────────────────────────────────────────────────
  // Unauthenticated headline counts for the login brand panel. Aggregate
  // counts only — no per-user or per-group detail is exposed.
  app.get("/api/admin/public-stats", async () => {
    const [totalUsers, activeGroups, expensesCents] = await Promise.all([
      countDistinctUsers(db),
      countActiveGroups(db),
      sumLiveExpensesCents(db),
    ]);
    const res: AdminPublicStatsDto = {
      totalUsers,
      activeGroups,
      expensesTracked: centsToDecimal(expensesCents),
    };
    return res;
  });

  // ─── identity ──────────────────────────────────────────────────────
  app.get("/api/admin/me", { preHandler: auth }, async (req) => {
    const a = req.admin!;
    const res: AdminMeDto = { uid: a.uid, email: a.email, role: a.role };
    return res;
  });

  // ─── console admins (app_config.admins) ────────────────────────────
  const accountsDto = async (canManage: boolean): Promise<AdminAccountsDto> => {
    const a = await getAdmins(db);
    const supers = new Set(a.supers ?? []);
    return {
      canManage,
      admins: a.emails
        .map((email) => ({ email, role: supers.has(email) ? ("super" as const) : ("admin" as const) }))
        .sort((x, y) => Number(y.role === "super") - Number(x.role === "super") || x.email.localeCompare(y.email)),
    };
  };

  app.get("/api/admin/admins", { preHandler: auth }, async (req) => accountsDto(req.admin!.role === "super"));

  // Add an admin or change their role. Super only; a super can't demote themselves.
  app.put("/api/admin/admins", { preHandler: auth }, async (req, reply) => {
    if (req.admin!.role !== "super") return reply.code(403).send({ error: "only super admins can manage admins" });
    const parsed = adminAccountSchema.safeParse(req.body ?? {});
    if (!parsed.success) return reply.code(400).send({ error: "a valid email and role are required" });
    const { email, role } = parsed.data;
    if (email === req.admin!.email && role !== "super") {
      return reply.code(409).send({ error: "you can't remove your own super role" });
    }
    const a = await getAdmins(db);
    const emails = [...new Set([...a.emails, email])];
    const supers = new Set(a.supers ?? []);
    if (role === "super") supers.add(email);
    else supers.delete(email);
    await setConfig(db, "admins", { emails, supers: [...supers] }, req.admin!.uid);
    await audit(req, a.emails.includes(email) ? "admin.role" : "admin.add", "admin", email, { role });
    return accountsDto(true);
  });

  app.delete("/api/admin/admins/:email", { preHandler: auth }, async (req, reply) => {
    if (req.admin!.role !== "super") return reply.code(403).send({ error: "only super admins can manage admins" });
    const email = decodeURIComponent((req.params as { email: string }).email).toLowerCase();
    if (email === req.admin!.email) return reply.code(409).send({ error: "you can't remove yourself" });
    const a = await getAdmins(db);
    if (!a.emails.includes(email)) return reply.code(404).send({ error: "not an admin" });
    await setConfig(
      db,
      "admins",
      { emails: a.emails.filter((e) => e !== email), supers: (a.supers ?? []).filter((e) => e !== email) },
      req.admin!.uid,
    );
    await audit(req, "admin.remove", "admin", email);
    return accountsDto(true);
  });

  // ─── overview ──────────────────────────────────────────────────────
  app.get("/api/admin/overview", { preHandler: auth }, async () => {
    const weekAgo = new Date(now() - 7 * 24 * 60 * 60 * 1000);
    const [
      totalUsers,
      activeGroups,
      expensesCents,
      settlementsWeek,
      series,
      recent,
      top,
      users,
    ] = await Promise.all([
      countDistinctUsers(db),
      countActiveGroups(db),
      sumLiveExpensesCents(db),
      countSettlementsSince(db, weekAgo),
      activitySeries(db, 14),
      recentActivity(db, 6),
      topGroupsByVolume(db, 5),
      listUsers(db),
    ]);

    const statusCounts = { active: 0, idle: 0, new: 0, suspended: 0 };
    for (const u of users) {
      statusCounts[toUserDto(u, now()).status] += 1;
    }

    const res: AdminOverviewDto = {
      kpis: {
        totalUsers,
        activeGroups,
        expensesTracked: centsToDecimal(expensesCents),
        settlementsPerWeek: settlementsWeek,
        deltas: { users: 0, groups: 0, expenses: 0, settlements: 0 },
      },
      activity: series,
      statusBreakdown: (
        ["active", "idle", "new", "suspended"] as const
      ).map((status) => ({ status, count: statusCounts[status] })),
      recent: recent.map((r) => ({
        id: r.id,
        kind: r.kind,
        text: r.text,
        at: r.at.toISOString(),
      })),
      topGroups: top.map(toTopGroupDto),
    };
    return res;
  });

  // ─── users ─────────────────────────────────────────────────────────
  app.get("/api/admin/users", { preHandler: auth }, async () => {
    const rows = await listUsers(db);
    const ts = now();
    const res: AdminUserDto[] = rows.map((r) => toUserDto(r, ts));
    return res;
  });

  app.get("/api/admin/users/:telegramId", { preHandler: auth }, async (req, reply) => {
    const { telegramId } = req.params as { telegramId: string };
    if (!/^-?\d+$/.test(telegramId)) return reply.code(404).send({ error: "user not found" });
    const user = (await listUsers(db)).find((u) => u.telegramUserId === BigInt(telegramId));
    if (!user) return reply.code(404).send({ error: "user not found" });
    const rows = await db.select().from(members).where(eq(members.telegramUserId, BigInt(telegramId)));
    const memberships = [];
    for (const m of rows) {
      const ledger = await loadGroupLedger(db, m.groupId);
      if (ledger) memberships.push(membershipOf(ledger, m));
    }
    const recent = await listExpensePage(db, { memberIds: rows.map((m) => m.id), limit: 30, offset: 0 });
    const res: AdminUserDetailDto = {
      user: toUserDto(user, now()),
      memberships: memberships.sort((a, b) => Number(b.isActive) - Number(a.isActive)),
      recentExpenses: recent.items,
    };
    return res;
  });

  app.post(
    "/api/admin/users/:telegramId/suspend",
    { preHandler: auth },
    async (req, reply) => {
      const { telegramId } = req.params as { telegramId: string };
      const changed = await setUserActive(db, BigInt(telegramId), false);
      if (changed === 0) return reply.code(404).send({ error: "user not found" });
      await writeAudit(db, {
        actorUid: req.admin!.uid,
        actorEmail: req.admin!.email,
        action: "user.suspend",
        targetType: "user",
        targetId: telegramId,
        detail: { memberRowsChanged: changed },
      });
      return { ok: true, changed };
    },
  );

  app.post(
    "/api/admin/users/:telegramId/activate",
    { preHandler: auth },
    async (req, reply) => {
      const { telegramId } = req.params as { telegramId: string };
      const changed = await setUserActive(db, BigInt(telegramId), true);
      if (changed === 0) return reply.code(404).send({ error: "user not found" });
      await writeAudit(db, {
        actorUid: req.admin!.uid,
        actorEmail: req.admin!.email,
        action: "user.activate",
        targetType: "user",
        targetId: telegramId,
        detail: { memberRowsChanged: changed },
      });
      return { ok: true, changed };
    },
  );

  // ─── groups ────────────────────────────────────────────────────────
  app.get("/api/admin/groups", { preHandler: auth }, async () => {
    const rows = await db.select({ id: groups.id }).from(groups);
    const ledgers = (await Promise.all(rows.map((g) => loadGroupLedger(db, g.id)))).filter(
      (l): l is GroupLedger => l !== null,
    );
    const res: AdminGroupDto[] = ledgers
      .map(groupSummary)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    return res;
  });

  app.get("/api/admin/groups/:groupId", { preHandler: auth }, async (req, reply) => {
    const { groupId } = req.params as { groupId: string };
    if (!UUID_RE.test(groupId)) return reply.code(404).send({ error: "group not found" });
    const ledger = await loadGroupLedger(db, groupId);
    if (!ledger) return reply.code(404).send({ error: "group not found" });
    const res: AdminGroupDetailDto = groupDetail(ledger);
    res.settings.access.aiCallsToday = (await aiCallsByGroupSince(db, aiDayStart(new Date(now())))).get(groupId) ?? 0;
    return res;
  });

  app.patch("/api/admin/groups/:groupId", { preHandler: auth }, async (req, reply) => {
    const { groupId } = req.params as { groupId: string };
    const group = UUID_RE.test(groupId) ? await getGroup(db, groupId) : null;
    if (!group) return reply.code(404).send({ error: "group not found" });
    const parsed = updateGroupSchema.safeParse(req.body ?? {});
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.issues[0]?.message ?? "invalid body" });
    const patch: { name?: string; defaultCurrency?: string } = {};
    if (parsed.data.name && parsed.data.name !== group.name) patch.name = parsed.data.name;
    if (parsed.data.defaultCurrency && parsed.data.defaultCurrency !== group.defaultCurrency) {
      // Same rule as the mini app: amounts would change meaning under a new currency.
      if (await groupHasAnyExpense(db, groupId)) {
        return reply.code(409).send({ error: "currency is locked because the group has expenses" });
      }
      patch.defaultCurrency = parsed.data.defaultCurrency;
    }
    await updateGroupFields(db, groupId, patch);
    let telegramSynced: boolean | null = null;
    if (patch.name) {
      const res = await telegram.call("setChatTitle", {
        chat_id: group.telegramChatId.toString(),
        title: patch.name,
      });
      telegramSynced = res.ok;
    }
    await audit(req, "group.update", "group", groupId, { ...patch, telegramSynced });
    const ledger = await loadGroupLedger(db, groupId);
    const res: UpdateGroupResultDto = { group: groupSummary(ledger!), telegramSynced };
    return res;
  });

  app.patch("/api/admin/groups/:groupId/humor", { preHandler: auth }, async (req, reply) => {
    const { groupId } = req.params as { groupId: string };
    const group = UUID_RE.test(groupId) ? await getGroup(db, groupId) : null;
    if (!group) return reply.code(404).send({ error: "group not found" });
    const body = (req.body ?? {}) as Record<string, unknown>;
    if (typeof body !== "object" || Array.isArray(body)) return reply.code(400).send({ error: "invalid body" });
    const res = await patchGroupHumor(db, group, body, new Date(now()));
    if ("error" in res) return reply.code(400).send(res);
    await audit(req, "group.humor", "group", groupId, body);
    return res;
  });

  app.patch("/api/admin/groups/:groupId/members/:memberId", { preHandler: auth }, async (req, reply) => {
    const { groupId, memberId } = req.params as { groupId: string; memberId: string };
    if (!UUID_RE.test(groupId) || !UUID_RE.test(memberId)) return reply.code(404).send({ error: "member not found" });
    const parsed = updateMemberSchema.safeParse(req.body ?? {});
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.issues[0]?.message ?? "invalid body" });
    const res = await updateGroupMember(db, groupId, memberId, parsed.data);
    if (!res.ok) return reply.code(res.status).send({ error: res.error });
    await audit(req, "member.update", "group", groupId, { memberId, ...parsed.data });
    return { ok: true };
  });

  app.post("/api/admin/groups/:groupId/reset", { preHandler: auth }, async (req, reply) => {
    const { groupId } = req.params as { groupId: string };
    const group = UUID_RE.test(groupId) ? await getGroup(db, groupId) : null;
    if (!group) return reply.code(404).send({ error: "group not found" });
    const deleted = await resetGroupLedger(db, groupId);
    await audit(req, "group.reset", "group", groupId, { name: group.name, deleted });
    return { deleted };
  });

  // Access: pause the group's AI, suspend the whole group, or cap its daily
  // AI calls. Groups are never deleted from the console; clear expenses instead.
  app.patch("/api/admin/groups/:groupId/access", { preHandler: auth }, async (req, reply) => {
    const { groupId } = req.params as { groupId: string };
    const group = UUID_RE.test(groupId) ? await getGroup(db, groupId) : null;
    if (!group) return reply.code(404).send({ error: "group not found" });
    const parsed = groupAccessSchema.safeParse(req.body ?? {});
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.issues[0]?.message ?? "invalid body" });
    if (parsed.data.until && Date.parse(parsed.data.until) <= now()) {
      return reply.code(400).send({ error: "the end time must be in the future" });
    }
    const access = await setGroupAccess(db, group, parsed.data, { by: req.admin!.email ?? req.admin!.uid, now: new Date(now()) });
    await audit(req, "group.access", "group", groupId, { name: group.name, ...parsed.data });
    return access;
  });

  // ─── expenses (cross-group feed, or one group's) ────────────────────
  app.get("/api/admin/expenses", { preHandler: auth }, async (req, reply) => {
    const q = req.query as { limit?: string; offset?: string; groupId?: string; kind?: string; q?: string };
    if (q.groupId && !UUID_RE.test(q.groupId)) return reply.code(400).send({ error: "bad groupId" });
    const res: AdminExpensePageDto = await listExpensePage(db, {
      groupId: q.groupId,
      kind: q.kind === "expense" || q.kind === "loan" ? q.kind : undefined,
      search: q.q?.trim().slice(0, 100) || undefined,
      limit: clampInt(q.limit, 50, 1, 200),
      offset: clampInt(q.offset, 0, 0, 1_000_000),
    });
    return res;
  });

  // ─── activity & logs ───────────────────────────────────────────────
  app.get("/api/admin/logs", { preHandler: auth }, async (req) => {
    const { limit, offset } = req.query as { limit?: string; offset?: string };
    const rows = await listAudit(
      db,
      Math.min(Number(limit ?? 50), 200),
      Number(offset ?? 0),
    );
    const res: AdminAuditEntryDto[] = rows.map(toAuditDto);
    return res;
  });

  app.get("/api/admin/activity", { preHandler: auth }, async (req, reply) => {
    const q = req.query as { source?: string; severity?: string; groupId?: string; limit?: string; offset?: string };
    if (q.groupId && !UUID_RE.test(q.groupId)) return reply.code(400).send({ error: "bad groupId" });
    const res: AdminActivityPageDto = await listActivity(db, {
      source: ACTIVITY_SOURCES.includes(q.source as AdminActivitySource) ? (q.source as AdminActivitySource) : undefined,
      severity: ACTIVITY_SEVERITIES.includes(q.severity as AdminActivitySeverity)
        ? (q.severity as AdminActivitySeverity)
        : undefined,
      groupId: q.groupId,
      limit: clampInt(q.limit, 30, 1, 200),
      offset: clampInt(q.offset, 0, 0, 1_000_000),
    });
    return res;
  });

  // ─── bot health & runtime switches ─────────────────────────────────
  app.get("/api/admin/bot/status", { preHandler: auth }, async () => {
    const res: AdminBotStatusDto = await botStatus(db, telegram, now());
    return res;
  });

  // The model the bot runs now: the console override, else the bot's env default.
  const activeModel = async () =>
    runtimeConfigFromRows(await listConfig(db)).model ?? deps.groq?.model ?? DEFAULT_GROQ_MODEL;

  app.get("/api/admin/ai/usage", { preHandler: auth }, async () => {
    const res: AdminAiUsageDto = await aiUsage(db, {
      now: new Date(now()),
      model: await activeModel(),
      canCheck: Boolean(deps.groq?.apiKey),
    });
    return res;
  });

  app.post("/api/admin/ai/limits/check", { preHandler: auth }, async (_req, reply) => {
    if (!deps.groq?.apiKey) return reply.code(503).send({ error: "GROQ_API_KEY is not set on the API" });
    const res = await checkGroqLimits(db, { apiKey: deps.groq.apiKey, model: await activeModel(), now: new Date(now()) });
    if ("error" in res) return reply.code(502).send(res);
    return res;
  });

  app.get("/api/admin/bot/config", { preHandler: auth }, async () => {
    const res: BotRuntimeConfig = runtimeConfigFromRows(await listConfig(db));
    return res;
  });

  app.patch("/api/admin/bot/config", { preHandler: auth }, async (req, reply) => {
    const parsed = botConfigSchema.safeParse(req.body ?? {});
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.issues[0]?.message ?? "invalid body" });
    for (const [field, raw] of Object.entries(parsed.data) as [keyof BotRuntimeConfig, unknown][]) {
      await setConfig(db, BOT_RUNTIME_KEYS[field], parseRuntimeValue(field, raw), req.admin!.uid);
    }
    await audit(req, "bot.config", "config", "bot", parsed.data);
    const res: BotRuntimeConfig = runtimeConfigFromRows(await listConfig(db));
    return res;
  });

  // ─── announcements ─────────────────────────────────────────────────
  app.get("/api/admin/announcements", { preHandler: auth }, async () => {
    const rows = await listAnnouncements(db);
    const res: AnnouncementDto[] = rows.map(toAnnouncementDto);
    return res;
  });

  app.post(
    "/api/admin/announcements",
    { preHandler: auth },
    async (req, reply) => {
      const parsed = createAnnouncementSchema.safeParse(req.body);
      if (!parsed.success) {
        return reply.code(400).send({ error: "invalid body", issues: parsed.error.issues });
      }
      const { title, body, audience, targetId, queue } = parsed.data;
      if (audience !== "all_groups" && !targetId) {
        return reply.code(400).send({ error: "targetId required for this audience" });
      }
      if (audience === "group" && !UUID_RE.test(targetId!)) {
        return reply.code(400).send({ error: "targetId must be a group id" });
      }
      if (audience === "user" && !/^\d+$/.test(targetId!)) {
        return reply.code(400).send({ error: "targetId must be a Telegram user id" });
      }
      if (queue && !telegram.configured) {
        return reply.code(503).send({ error: "sending is not set up: TELEGRAM_BOT_TOKEN is missing on the API" });
      }
      const row = await createAnnouncement(db, {
        title,
        body,
        audience,
        targetId: targetId ?? null,
        status: queue ? "queued" : "draft",
        createdByUid: req.admin!.uid,
      });
      await writeAudit(db, {
        actorUid: req.admin!.uid,
        actorEmail: req.admin!.email,
        action: queue ? "announcement.queue" : "announcement.draft",
        targetType: "announcement",
        targetId: row.id,
        detail: { audience, targetId: targetId ?? null },
      });
      if (queue) sendInBackground(row.id);
      return reply.code(201).send(toAnnouncementDto(row));
    },
  );

  app.post("/api/admin/announcements/:id/send", { preHandler: auth }, async (req, reply) => {
    const { id } = req.params as { id: string };
    if (!UUID_RE.test(id)) return reply.code(404).send({ error: "announcement not found" });
    if (!telegram.configured) {
      return reply.code(503).send({ error: "sending is not set up: TELEGRAM_BOT_TOKEN is missing on the API" });
    }
    const [row] = await db
      .update(announcements)
      .set({ status: "queued" })
      .where(and(eq(announcements.id, id), inArray(announcements.status, ["draft", "failed"])))
      .returning();
    if (!row) return reply.code(409).send({ error: "only drafts or failed announcements can be sent" });
    await audit(req, "announcement.send", "announcement", id);
    sendInBackground(id);
    return toAnnouncementDto(row);
  });

  app.delete("/api/admin/announcements/:id", { preHandler: auth }, async (req, reply) => {
    const { id } = req.params as { id: string };
    if (!UUID_RE.test(id)) return reply.code(404).send({ error: "announcement not found" });
    const gone = await db
      .delete(announcements)
      .where(and(eq(announcements.id, id), inArray(announcements.status, ["draft", "failed"])))
      .returning({ id: announcements.id });
    if (gone.length === 0) return reply.code(409).send({ error: "only drafts or failed announcements can be deleted" });
    await audit(req, "announcement.delete", "announcement", id);
    return { ok: true };
  });

  // ─── bot & settings (app_config) ───────────────────────────────────
  app.get("/api/admin/config", { preHandler: auth }, async () => {
    const rows = await listConfig(db);
    const res: AppConfigDto[] = rows.map((r) => ({
      key: r.key,
      value: r.value,
      updatedAt: r.updatedAt.toISOString(),
    }));
    return res;
  });

  app.patch("/api/admin/config", { preHandler: auth }, async (req, reply) => {
    const parsed = updateConfigSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: "invalid body" });
    }
    await setConfig(db, parsed.data.key, parsed.data.value, req.admin!.uid);
    await writeAudit(db, {
      actorUid: req.admin!.uid,
      actorEmail: req.admin!.email,
      action: "config.update",
      targetType: "config",
      targetId: parsed.data.key,
      detail: {},
    });
    return { ok: true };
  });
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function clampInt(raw: string | undefined, fallback: number, min: number, max: number): number {
  const n = Number(raw ?? fallback);
  return Number.isFinite(n) ? Math.min(max, Math.max(min, Math.floor(n))) : fallback;
}
