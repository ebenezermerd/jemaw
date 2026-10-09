/**
 * Bot health for the console: Telegram's view (getMe, getWebhookInfo) plus the
 * heartbeat the bot writes to app_config every few minutes.
 */
import type { AdminBotStatusDto } from "@jemaw/shared/types";
import { BOT_HEARTBEAT_KEY, type BotHeartbeat } from "@jemaw/shared/runtimeConfig";
import type { Db } from "./db.js";
import type { TelegramClient } from "./telegram.js";
import { getConfig } from "./repo.js";

/** A heartbeat older than this means the bot is asleep or down. */
const STALE_MS = 15 * 60_000;

export async function botStatus(db: Db, tg: TelegramClient, now: number): Promise<AdminBotStatusDto> {
  const heartbeat = ((await getConfig(db, BOT_HEARTBEAT_KEY)) as BotHeartbeat | null) ?? null;
  const fresh = heartbeat ? now - Date.parse(heartbeat.at) < STALE_MS : false;
  if (!tg.configured) {
    return {
      configured: false,
      username: null,
      webhook: null,
      heartbeat,
      health: fresh ? "warn" : "down",
      error: "TELEGRAM_BOT_TOKEN is not set on the API",
    };
  }
  const [me, hook] = await Promise.all([
    tg.call<{ username: string }>("getMe"),
    tg.call<{
      url: string;
      pending_update_count: number;
      last_error_date?: number;
      last_error_message?: string;
    }>("getWebhookInfo"),
  ]);
  const webhook = hook.ok
    ? {
        url: hook.result.url || null,
        pendingUpdates: hook.result.pending_update_count,
        lastErrorAt: hook.result.last_error_date ? new Date(hook.result.last_error_date * 1000).toISOString() : null,
        lastErrorMessage: hook.result.last_error_message ?? null,
      }
    : null;
  // A webhook error in the last hour means updates are not getting through.
  const recentError =
    webhook?.lastErrorAt != null && now - Date.parse(webhook.lastErrorAt) < 60 * 60_000;
  const health: AdminBotStatusDto["health"] = !me.ok ? "down" : fresh && !recentError ? "ok" : "warn";
  return {
    configured: true,
    username: me.ok ? me.result.username : null,
    webhook,
    heartbeat,
    health,
    error: me.ok ? null : me.error,
  };
}
