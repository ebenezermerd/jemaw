/** Live bot health from /api/admin/bot/status, refreshed every minute. */
import { useQuery } from "@tanstack/react-query";
import { api } from "../lib/api.js";
import type { AdminBotStatusDto } from "@jemaw/shared/types";
import { Skeleton } from "./Loader.js";

const COLORS = {
  ok: { dot: "var(--success)", ring: "rgba(45,212,167,.18)", label: "Bot online" },
  warn: { dot: "var(--warn)", ring: "rgba(224,178,60,.18)", label: "Bot needs a look" },
  down: { dot: "var(--danger)", ring: "rgba(242,104,95,.18)", label: "Bot unreachable" },
} as const;

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

export function BotStatusBox() {
  const { data, isLoading, isError } = useBotStatus();
  const c = COLORS[data?.health ?? (isError ? "down" : "warn")];
  return (
    <div style={{ background: "var(--surface-2)", border: "1px solid var(--hairline)", borderRadius: 13, padding: "11px 14px", marginBottom: 10 }}>
      {isLoading ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
          <Skeleton height={11} width="55%" radius={5} />
          <Skeleton height={9} width="85%" radius={5} />
        </div>
      ) : (
        <>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 5 }}>
            <span style={{ width: 7, height: 7, borderRadius: "50%", background: c.dot, boxShadow: `0 0 0 3px ${c.ring}`, flex: "none" }} />
            <span style={{ fontSize: 12, fontWeight: 700 }}>{isError ? "Status unavailable" : c.label}</span>
          </div>
          <div style={{ fontSize: 11, color: "var(--text-dim)", lineHeight: 1.45 }}>
            {data ? statusDetail(data) : "Could not reach the API"}
          </div>
        </>
      )}
    </div>
  );
}
