/** Live bot health from /api/admin/bot/status, refreshed every minute. */
import { useQuery } from "@tanstack/react-query";
import { api } from "../lib/api.js";
import type { AdminBotStatusDto } from "@jemaw/shared/types";

export function useBotStatus() {
  return useQuery({
    queryKey: ["bot-status"],
    queryFn: () => api.get<AdminBotStatusDto>("/api/admin/bot/status"),
    refetchInterval: 60_000,
  });
}

export function ago(iso: string, now = Date.now()): string {
  const m = Math.round((now - Date.parse(iso)) / 60_000);
  if (m < 1) return "just now";
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  return h < 48 ? `${h} h ago` : `${Math.round(h / 24)} d ago`;
}

/** One line on what is wrong (or right). */
export function statusDetail(s: AdminBotStatusDto): string {
  const name = s.username ? `@${s.username}` : "the bot";
  if (!s.configured) return "Add TELEGRAM_BOT_TOKEN to the API to check the bot";
  if (s.error) return `${name} · ${s.error}`;
  if (s.webhook?.lastErrorAt && Date.now() - Date.parse(s.webhook.lastErrorAt) < 3_600_000) {
    return `${name} · webhook error ${ago(s.webhook.lastErrorAt)}`;
  }
  if (!s.heartbeat) return `${name} · no heartbeat yet (ships with the next bot deploy)`;
  const beat = `last seen ${ago(s.heartbeat.at)}`;
  return s.health === "ok" ? `${name} · ${beat}` : `${name} · asleep or down, ${beat}`;
}
