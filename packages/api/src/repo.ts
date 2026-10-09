/**
 * Admin-side data access. Read-heavy aggregations over the shared schema plus
 * the three admin tables. Bigint telegram ids and numeric money are converted
 * to strings at the boundary (callers map to DTOs).
 */
import { and, desc, eq, gte, isNull, sql } from "drizzle-orm";
import type { Db } from "./db.js";
import {
  groups,
  members,
  expenses,
  settlements,
  adminAuditLog,
  announcements,
  appConfig,
  type Announcement,
  type AdminAuditLog,
} from "@jemaw/shared/schema";

// ─── app_config / admin allowlist ─────────────────────────────────────
const ADMINS_KEY = "admins";

interface AdminsConfig {
  /** lowercase emails allowed into the console */
  emails: string[];
  /** emails with the elevated "super" role */
  supers?: string[];
}

export async function getConfig(db: Db, key: string): Promise<unknown> {
  const rows = await db
    .select()
    .from(appConfig)
    .where(eq(appConfig.key, key))
    .limit(1);
  return rows[0]?.value ?? null;
}

export async function listConfig(db: Db): Promise<
  { key: string; value: unknown; updatedAt: Date }[]
> {
  const rows = await db.select().from(appConfig).orderBy(appConfig.key);
  return rows.map((r) => ({ key: r.key, value: r.value, updatedAt: r.updatedAt }));
}

export async function setConfig(
  db: Db,
  key: string,
  value: unknown,
  updatedByUid: string,
): Promise<void> {
  await db
    .insert(appConfig)
    .values({ key, value, updatedByUid, updatedAt: new Date() })
    .onConflictDoUpdate({
      target: appConfig.key,
      set: { value, updatedByUid, updatedAt: new Date() },
    });
}

export async function getAdmins(db: Db): Promise<AdminsConfig> {
  const value = (await getConfig(db, ADMINS_KEY)) as AdminsConfig | null;
  if (!value) return { emails: [], supers: [] };
  return { emails: value.emails ?? [], supers: value.supers ?? [] };
}

/** Seed the allowlist on first boot if it is empty. */
export async function seedAdminsIfEmpty(
  db: Db,
  emails: string[],
): Promise<void> {
  if (emails.length === 0) return;
  const current = await getAdmins(db);
  if (current.emails.length > 0) return;
  await setConfig(db, ADMINS_KEY, { emails, supers: emails }, "system");
}

// ─── audit log ─────────────────────────────────────────────────────────
export async function writeAudit(
  db: Db,
  entry: {
    actorUid: string;
    actorEmail: string | null;
    action: string;
    targetType?: string;
    targetId?: string;
    detail?: Record<string, unknown>;
  },
): Promise<void> {
  await db.insert(adminAuditLog).values({
    actorUid: entry.actorUid,
    actorEmail: entry.actorEmail,
    action: entry.action,
    targetType: entry.targetType ?? null,
    targetId: entry.targetId ?? null,
    detail: entry.detail ?? {},
  });
}

export async function listAudit(
  db: Db,
  limit: number,
  offset: number,
): Promise<AdminAuditLog[]> {
  return db
    .select()
    .from(adminAuditLog)
    .orderBy(desc(adminAuditLog.createdAt))
    .limit(limit)
    .offset(offset);
}

// ─── announcements ──────────────────────────────────────────────────────
export async function listAnnouncements(db: Db): Promise<Announcement[]> {
  return db
    .select()
    .from(announcements)
    .orderBy(desc(announcements.createdAt))
    .limit(100);
}

export async function createAnnouncement(
  db: Db,
  values: typeof announcements.$inferInsert,
): Promise<Announcement> {
  const rows = await db.insert(announcements).values(values).returning();
  return rows[0]!;
}

// ─── users (members aggregated by telegram id) ────────────────────────────
export interface AdminUserRow {
  telegramUserId: bigint;
  displayName: string;
  username: string | null;
  groupCount: number;
  isActive: boolean;
  lastActiveAt: Date | null;
  joinedAt: Date;
}

/**
 * Aggregate members across groups by telegram_user_id. A user is "active" if
 * any of their member rows is active. last_active is the latest expense they
 * created or paid for. Synthetic negative ids (manual members) are included.
 */
export async function listUsers(db: Db): Promise<AdminUserRow[]> {
  const rows = await db
    .select({
      telegramUserId: members.telegramUserId,
      // The name from their most recent membership; names differ per group.
      displayName: sql<string>`(array_agg(${members.displayName} order by ${members.joinedAt} desc))[1]`,
      username: sql<string | null>`max(${members.username})`,
      groupCount: sql<number>`(count(distinct ${members.groupId}) filter (where ${members.isActive}))::int`,
      joinedAt: sql<Date>`max(${members.joinedAt})`,
      anyActive: sql<boolean>`bool_or(${members.isActive})`,
      lastActiveAt: sql<Date | null>`max((select max(e."created_at") from "expenses" e where e."created_by_member_id" = "members"."id" or e."payer_member_id" = "members"."id"))`,
    })
    .from(members)
    .groupBy(members.telegramUserId)
    .orderBy(desc(sql`bool_or(${members.isActive})`));
  return rows.map((r) => ({
    telegramUserId: r.telegramUserId,
    displayName: r.displayName,
    username: r.username,
    groupCount: Number(r.groupCount),
    isActive: r.anyActive,
    lastActiveAt: r.lastActiveAt ? new Date(r.lastActiveAt) : null,
    joinedAt: new Date(r.joinedAt),
  }));
}

/** Suspend or reactivate every member row for a telegram id. Returns rows changed. */
export async function setUserActive(
  db: Db,
  telegramUserId: bigint,
  isActive: boolean,
): Promise<number> {
  const rows = await db
    .update(members)
    // Suspended people leave the default split for new expenses, like a mini
    // app removal; past shares and balances are untouched.
    .set({ isActive, isPrimary: isActive })
    .where(eq(members.telegramUserId, telegramUserId))
    .returning({ id: members.id });
  return rows.length;
}

// ─── overview aggregates ──────────────────────────────────────────────────
export async function countDistinctUsers(db: Db): Promise<number> {
  const rows = await db
    .select({ n: sql<number>`count(distinct ${members.telegramUserId})::int` })
    .from(members);
  return Number(rows[0]?.n ?? 0);
}

export async function countActiveGroups(db: Db): Promise<number> {
  const rows = await db.select({ n: sql<number>`count(*)::int` }).from(groups);
  return Number(rows[0]?.n ?? 0);
}

export async function sumLiveExpensesCents(db: Db): Promise<number> {
  const rows = await db
    .select({
      total: sql<string>`coalesce(sum(${expenses.amount}), 0)`,
    })
    .from(expenses)
    .where(and(isNull(expenses.voidedAt), eq(expenses.kind, "expense")));
  return Math.round(Number(rows[0]?.total ?? 0) * 100);
}

export async function countSettlementsSince(db: Db, since: Date): Promise<number> {
  const rows = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(settlements)
    .where(gte(settlements.createdAt, since));
  return Number(rows[0]?.n ?? 0);
}

export interface DailyCount {
  date: string;
  expenses: number;
  settlements: number;
}

/** Per-day expense + settlement counts over the last `days` days. */
export async function activitySeries(db: Db, days: number): Promise<DailyCount[]> {
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  const expRows = await db
    .select({
      day: sql<string>`to_char(${expenses.createdAt}, 'YYYY-MM-DD')`,
      n: sql<number>`count(*)::int`,
    })
    .from(expenses)
    .where(and(gte(expenses.createdAt, since), isNull(expenses.voidedAt)))
    .groupBy(sql`to_char(${expenses.createdAt}, 'YYYY-MM-DD')`);
  const setRows = await db
    .select({
      day: sql<string>`to_char(${settlements.createdAt}, 'YYYY-MM-DD')`,
      n: sql<number>`count(*)::int`,
    })
    .from(settlements)
    .where(gte(settlements.createdAt, since))
    .groupBy(sql`to_char(${settlements.createdAt}, 'YYYY-MM-DD')`);

  const byDay = new Map<string, { expenses: number; settlements: number }>();
  for (let i = 0; i < days; i++) {
    const d = new Date(since.getTime() + i * 24 * 60 * 60 * 1000);
    byDay.set(d.toISOString().slice(0, 10), { expenses: 0, settlements: 0 });
  }
  for (const r of expRows) {
    const e = byDay.get(r.day);
    if (e) e.expenses = Number(r.n);
  }
  for (const r of setRows) {
    const e = byDay.get(r.day);
    if (e) e.settlements = Number(r.n);
  }
  return [...byDay.entries()].map(([date, v]) => ({ date, ...v }));
}

export interface RecentRow {
  id: string;
  kind: "expense" | "settlement";
  text: string;
  at: Date;
}

/** A small merged feed of the latest expenses and settlements for the overview. */
export async function recentActivity(db: Db, limit: number): Promise<RecentRow[]> {
  const exp = await db
    .select({
      id: expenses.id,
      description: expenses.description,
      amount: expenses.amount,
      currency: expenses.currency,
      at: expenses.createdAt,
      kind: expenses.kind,
      groupName: groups.name,
    })
    .from(expenses)
    .innerJoin(groups, eq(expenses.groupId, groups.id))
    .where(isNull(expenses.voidedAt))
    .orderBy(desc(expenses.createdAt))
    .limit(limit);
  const set = await db
    .select({
      id: settlements.id,
      amount: settlements.amount,
      currency: settlements.currency,
      at: settlements.createdAt,
      groupName: groups.name,
    })
    .from(settlements)
    .innerJoin(groups, eq(settlements.groupId, groups.id))
    .orderBy(desc(settlements.createdAt))
    .limit(limit);

  const rows: RecentRow[] = [
    ...exp.map((e) => ({
      id: e.id,
      kind: (e.kind === "loan" ? "expense" : "expense") as "expense",
      text: `${e.kind === "loan" ? "Loan" : "Expense"} ${e.description} · ${e.amount} ${e.currency} in ${e.groupName}`,
      at: e.at,
    })),
    ...set.map((s) => ({
      id: s.id,
      kind: "settlement" as const,
      text: `Settlement ${s.amount} ${s.currency} in ${s.groupName}`,
      at: s.at,
    })),
  ];
  rows.sort((a, b) => b.at.getTime() - a.at.getTime());
  return rows.slice(0, limit);
}

export interface TopGroupRow {
  id: string;
  name: string;
  volumeCents: number;
}

export async function topGroupsByVolume(db: Db, limit: number): Promise<TopGroupRow[]> {
  const rows = await db
    .select({
      id: groups.id,
      name: groups.name,
      volume: sql<string>`coalesce(sum(${expenses.amount}), 0)`,
    })
    .from(groups)
    .leftJoin(
      expenses,
      and(eq(expenses.groupId, groups.id), isNull(expenses.voidedAt), eq(expenses.kind, "expense")),
    )
    .groupBy(groups.id, groups.name)
    .orderBy(desc(sql`coalesce(sum(${expenses.amount}), 0)`))
    .limit(limit);
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    volumeCents: Math.round(Number(r.volume) * 100),
  }));
}
