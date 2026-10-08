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
  toUserDto,
  toTopGroupDto,
  toAuditDto,
  toAnnouncementDto,
} from "./mappers.js";

export interface ApiDeps {
  db: Db;
  verifier: import("./auth/firebase.js").TokenVerifier;
  now: () => number;
}

const createAnnouncementSchema = z.object({
  title: z.string().min(1).max(120),
  body: z.string().min(1).max(4000),
  audience: z.enum(["all_groups", "group", "user"]),
  targetId: z.string().optional(),
  queue: z.boolean().optional().default(false),
});

const updateConfigSchema = z.object({
  key: z.string().min(1).max(120),
  value: z.unknown(),
});

export async function registerApi(
  app: FastifyInstance,
  deps: ApiDeps,
): Promise<void> {
  const { db, now } = deps;
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
    return res;
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
      return reply.code(201).send(toAnnouncementDto(row));
    },
  );

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
