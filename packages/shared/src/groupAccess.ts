/**
 * Per-group access the Jemaw team controls from the admin console, stored
 * under groups.settings.access:
 *  - active: everything works.
 *  - ai_paused: no AI scans or AI chat; plain ledger answers and the mini app
 *    keep working.
 *  - suspended: the bot ignores the group and the mini app shows a suspended
 *    screen. Data is kept.
 * A daily AI call limit can apply on top of "active". Pauses and suspensions
 * can end on their own at `until`.
 */
export type GroupAccessStatus = "active" | "ai_paused" | "suspended";

export interface GroupAccessV1 {
  status: GroupAccessStatus;
  /** ISO time the pause or suspension ends; null = until lifted */
  until: string | null;
  /** shown to members in the mini app and the bot notice */
  reason: string | null;
  /** max AI calls (scans + AI replies) per UTC day; null = no limit */
  aiDailyLimit: number | null;
  updatedAt?: string;
  updatedBy?: string;
}

export const DEFAULT_GROUP_ACCESS: GroupAccessV1 = {
  status: "active",
  until: null,
  reason: null,
  aiDailyLimit: null,
};

/** Read the stored access and apply expiry: a lapsed pause counts as active. */
export function parseGroupAccess(raw: unknown, now: Date = new Date()): GroupAccessV1 {
  if (!raw || typeof raw !== "object") return { ...DEFAULT_GROUP_ACCESS };
  const o = raw as Record<string, unknown>;
  const status: GroupAccessStatus =
    o.status === "ai_paused" || o.status === "suspended" ? o.status : "active";
  const until = typeof o.until === "string" && !Number.isNaN(Date.parse(o.until)) ? o.until : null;
  const limit = Number(o.aiDailyLimit);
  const access: GroupAccessV1 = {
    status,
    until: status === "active" ? null : until,
    reason: typeof o.reason === "string" && o.reason.trim() ? o.reason.trim().slice(0, 300) : null,
    aiDailyLimit: o.aiDailyLimit != null && Number.isFinite(limit) && limit >= 0 ? Math.floor(limit) : null,
    ...(typeof o.updatedAt === "string" ? { updatedAt: o.updatedAt } : {}),
    ...(typeof o.updatedBy === "string" ? { updatedBy: o.updatedBy } : {}),
  };
  if (access.status !== "active" && access.until && Date.parse(access.until) <= now.getTime()) {
    return { ...access, status: "active", until: null };
  }
  return access;
}

/** True when the group's AI must stay quiet (paused, suspended, or over today's limit). */
export function aiBlocked(access: GroupAccessV1, aiCallsToday: number): "paused" | "suspended" | "limit" | null {
  if (access.status === "suspended") return "suspended";
  if (access.status === "ai_paused") return "paused";
  if (access.aiDailyLimit != null && aiCallsToday >= access.aiDailyLimit) return "limit";
  return null;
}

/** Start of the UTC day the daily AI limit counts from. */
export function aiDayStart(now: Date = new Date()): Date {
  const d = new Date(now);
  d.setUTCHours(0, 0, 0, 0);
  return d;
}
