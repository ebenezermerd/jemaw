/**
 * Deliver an announcement or feature release through Telegram: resolve the
 * recipients, send each one the post in its saved message design, and record
 * the outcome on the row. A user can only be messaged once they have started
 * the bot privately.
 */
import { and, eq, inArray } from "drizzle-orm";
import type { Db } from "./db.js";
import { announcements, groups, type Announcement } from "@jemaw/shared/schema";
import type { TelegramClient } from "./telegram.js";
import { composePost, type PostData } from "@jemaw/shared/posts";
import { runtimeConfigFromRows } from "@jemaw/shared/runtimeConfig";
import type { ReleaseNotes } from "@jemaw/shared/types";
import { listConfig } from "./repo.js";
import { sendComposedPost, type ImageRenderer } from "./postSend.js";

export interface Recipient {
  chatId: string;
  label: string;
  /** Set for group chats, so "Open Jemaw" opens that group. */
  groupId?: string;
}

export interface DeliveryStats {
  delivered: number;
  failed: number;
  recipients: number;
  errors: { label: string; error: string }[];
}

/** The composer's input for a stored announcement or release. */
export function announcementPostData(a: Pick<Announcement, "kind" | "title" | "body" | "release">): PostData {
  if (a.kind === "release") {
    const r = (a.release ?? {}) as Partial<ReleaseNotes>;
    return {
      useCase: "release",
      data: { title: a.title, version: r.version || undefined, intro: a.body, added: r.added ?? [], improved: r.improved ?? [], fixed: r.fixed ?? [] },
    };
  }
  return { useCase: "announcement", data: { title: a.title, body: a.body } };
}

export async function resolveRecipients(db: Db, a: Pick<Announcement, "audience" | "targetId">): Promise<Recipient[]> {
  if (a.audience === "user") {
    return a.targetId && /^\d+$/.test(a.targetId) ? [{ chatId: a.targetId, label: `user ${a.targetId}` }] : [];
  }
  const rows =
    a.audience === "group"
      ? a.targetId
        ? await db.select().from(groups).where(eq(groups.id, a.targetId))
        : []
      : await db.select().from(groups);
  return rows.map((g) => ({ chatId: g.telegramChatId.toString(), label: g.name, groupId: g.id }));
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Send now. Safe to call for draft, queued or failed rows; sent rows are left alone. */
export async function deliverAnnouncement(
  db: Db,
  tg: TelegramClient,
  id: string,
  opts: { pauseMs?: number; render?: ImageRenderer; openAppUrl?: (groupId: string) => string | null } = {},
): Promise<DeliveryStats | null> {
  // Claim the row so two callers can't send it twice.
  const [row] = await db
    .update(announcements)
    .set({ status: "sending" })
    .where(and(eq(announcements.id, id), inArray(announcements.status, ["draft", "queued", "failed"])))
    .returning();
  if (!row) return null;

  const stats: DeliveryStats = { delivered: 0, failed: 0, recipients: 0, errors: [] };
  const recipients = await resolveRecipients(db, row);
  stats.recipients = recipients.length;
  const designs = runtimeConfigFromRows(await listConfig(db)).postDesigns;
  const input = announcementPostData(row);
  const render = opts.render ?? (async (spec) => (await import("@jemaw/shared/postImages")).renderPostImage(spec));
  for (const r of recipients) {
    const post = composePost(input, designs[input.useCase], {
      openUrl: r.groupId ? (opts.openAppUrl?.(r.groupId) ?? null) : null,
    });
    const res = await sendComposedPost(tg, r.chatId, post, render);
    if (res.ok) stats.delivered += 1;
    else {
      stats.failed += 1;
      if (stats.errors.length < 5) stats.errors.push({ label: r.label, error: res.error ?? "not delivered" });
    }
    // Stay well under Telegram's ~30 messages/second broadcast limit.
    await sleep(opts.pauseMs ?? 40);
  }
  if (recipients.length === 0) stats.errors.push({ label: "audience", error: "no recipients found" });
  await db
    .update(announcements)
    .set({ status: stats.delivered > 0 ? "sent" : "failed", sentAt: new Date(), stats })
    .where(eq(announcements.id, id));
  return stats;
}

/** Rows left queued (for example by a restart mid-send) are sent on boot. */
export async function sweepQueued(db: Db, tg: TelegramClient): Promise<void> {
  if (!tg.configured) return;
  const queued = await db
    .select({ id: announcements.id })
    .from(announcements)
    .where(inArray(announcements.status, ["queued", "sending"]));
  for (const q of queued) {
    await db.update(announcements).set({ status: "queued" }).where(eq(announcements.id, q.id));
    await deliverAnnouncement(db, tg, q.id).catch((err) =>
      console.warn(`[announce] ${q.id} failed:`, err instanceof Error ? err.message : err),
    );
  }
}
