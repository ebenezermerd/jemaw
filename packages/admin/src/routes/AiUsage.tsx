/**
 * AI usage & limits: what Groq says is left (requests today, tokens this
 * minute), today's calls and tokens, a 14-day trend, and how much of each
 * group's daily reply cap Jemaw has used.
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { api } from "../lib/api.js";
import type { AdminAiUsageDto } from "@jemaw/shared/types";
import type { RateWindow } from "@jemaw/shared/runtimeConfig";
import { fmtCompact } from "../lib/format.js";
import { GhostButton } from "../ui/Dialog.js";
import { Loader, Skeleton } from "../ui/Loader.js";
import { Card } from "../ui/primitives.js";
import { ago } from "../ui/BotStatus.js";

const errText = (e: unknown) => (e instanceof Error ? e.message : "Something went wrong.");

function fmtWait(s: number | null): string {
  if (s == null) return "";
  if (s < 60) return `${Math.ceil(s)}s`;
  if (s < 3600) return `${Math.round(s / 60)} min`;
  return `${Math.floor(s / 3600)} h ${Math.round((s % 3600) / 60)} min`;
}

/** Colour by how much is left: plenty, getting low, nearly out. */
function tone(left: number, limit: number) {
  const r = limit > 0 ? left / limit : 1;
  return r > 0.4 ? "var(--success)" : r > 0.15 ? "var(--warn)" : "var(--danger)";
}

function Meter({ label, hint, w, at }: { label: string; hint: string; w: RateWindow | null; at: string }) {
  if (!w) {
    return (
      <div style={{ flex: 1, minWidth: 200 }}>
        <div style={{ fontSize: 12.5, fontWeight: 600 }}>{label}</div>
        <div style={{ fontSize: 12, color: "var(--text-faint)", marginTop: 6 }}>Groq didn't report this one.</div>
      </div>
    );
  }
  // The window may have refilled since Groq last told us.
  const refilled = w.resetSeconds != null && Date.now() - Date.parse(at) > w.resetSeconds * 1000;
  const left = refilled ? w.limit : w.remaining;
  const pct = w.limit > 0 ? Math.max(0, Math.min(100, (left / w.limit) * 100)) : 0;
  return (
    <div style={{ flex: 1, minWidth: 200 }}>
      <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
        <span style={{ fontSize: 12.5, fontWeight: 600, flex: 1 }}>{label}</span>
        <span style={{ fontFamily: "var(--font-display)", fontWeight: 800, fontSize: 20, color: tone(left, w.limit), fontVariantNumeric: "tabular-nums" }}>
          {left.toLocaleString("en-US")}
        </span>
        <span style={{ fontSize: 12, color: "var(--text-dim)" }}>/ {w.limit.toLocaleString("en-US")}</span>
      </div>
      <div style={{ height: 7, borderRadius: 99, background: "var(--track)", marginTop: 8, overflow: "hidden" }}>
        <div style={{ width: `${pct}%`, height: "100%", borderRadius: 99, background: tone(left, w.limit), transition: "width .3s" }} />
      </div>
      <div style={{ fontSize: 11.5, color: "var(--text-faint)", marginTop: 6 }}>
        {hint}
        {refilled ? " · refilled since the last call" : w.resetSeconds != null && w.remaining < w.limit ? ` · full again in ${fmtWait(w.resetSeconds)}` : ""}
      </div>
    </div>
  );
}

export function AiUsageCard() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const { data: u, isLoading } = useQuery({
    queryKey: ["ai-usage"],
    queryFn: () => api.get<AdminAiUsageDto>("/api/admin/ai/usage"),
    refetchInterval: 60_000,
  });
  const check = useMutation({
    mutationFn: () => api.post("/api/admin/ai/limits/check"),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["ai-usage"] }),
  });

  if (isLoading || !u) {
    return (
      <Card>
        <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 14 }}>AI usage &amp; limits</div>
        <div role="status" aria-label="Loading" style={{ display: "grid", gap: 10 }}>
          <Skeleton height={54} />
          <Skeleton height={70} />
          <Skeleton height={90} />
        </div>
      </Card>
    );
  }

  const maxTokens = Math.max(1, ...u.days.map((d) => d.tokens));
  const lim = u.limits;
  return (
    <Card>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 4 }}>
        <div style={{ fontSize: 15, fontWeight: 700, flex: 1 }}>AI usage &amp; limits</div>
        {u.canCheck && (
          <GhostButton onClick={() => check.mutate()} disabled={check.isPending}>
            {check.isPending ? "Checking…" : "Check now"}
          </GhostButton>
        )}
      </div>
      <div style={{ fontSize: 12, color: "var(--text-faint)", marginBottom: 16 }}>
        Groq free tier · model <code style={{ fontFamily: "var(--font-mono)", color: "var(--accent-soft)" }}>{u.model}</code>
      </div>

      {/* what's left */}
      {lim ? (
        <>
          <div style={{ display: "flex", gap: 22, flexWrap: "wrap" }}>
            <Meter label="Requests left today" hint="Every scan and AI reply is one request" w={lim.requests} at={lim.at} />
            <Meter label="Tokens left this minute" hint="Long chats use more per request" w={lim.tokens} at={lim.at} />
          </div>
          <div style={{ fontSize: 11.5, color: "var(--text-faint)", marginTop: 10 }}>
            As Groq reported {ago(lim.at)} {lim.source === "check" ? "to a check from here" : "on the bot's last AI call"}
            {lim.model !== u.model ? ` (model ${lim.model})` : ""}.
          </div>
        </>
      ) : (
        <div style={{ fontSize: 13, color: "var(--text-dim)", lineHeight: 1.5 }}>
          No limit reading yet. {u.canCheck ? "Press Check now, or wait" : "It appears"} after the bot's next AI call once the latest bot version is deployed.
        </div>
      )}
      {check.isError && <div style={{ fontSize: 12, color: "var(--danger)", marginTop: 8 }}>{errText(check.error)}</div>}

      {/* today */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 10, marginTop: 20 }}>
        {[
          { v: String(u.today.calls), l: `AI calls today · ${u.today.scans} scans, ${u.today.replies} replies` },
          { v: fmtCompact(u.today.inputTokens), l: "Tokens read" },
          { v: fmtCompact(u.today.outputTokens), l: "Tokens written" },
          { v: String(u.today.errors), l: "Failed calls", warn: u.today.errors > 0 },
        ].map((x) => (
          <div key={x.l} style={{ background: "#1E1C2A", borderRadius: 11, padding: 11 }}>
            <div style={{ fontFamily: "var(--font-display)", fontWeight: 800, fontSize: 19, color: x.warn ? "var(--danger)" : "var(--text)" }}>{x.v}</div>
            <div style={{ fontSize: 11, color: "var(--text-dim)", marginTop: 2 }}>{x.l}</div>
          </div>
        ))}
      </div>

      {/* 14 days */}
      <div style={{ fontSize: 12, fontWeight: 600, color: "var(--text-dim)", margin: "20px 0 8px" }}>Tokens per day · last 14 days</div>
      <div style={{ display: "flex", alignItems: "flex-end", gap: 4, height: 70 }} aria-label="Tokens per day">
        {u.days.map((d) => (
          <div
            key={d.date}
            title={`${d.date}: ${d.tokens.toLocaleString("en-US")} tokens · ${d.scans} scans · ${d.replies} replies`}
            style={{
              flex: 1,
              height: `${Math.max(3, (d.tokens / maxTokens) * 100)}%`,
              borderRadius: 4,
              background: d.tokens ? "linear-gradient(180deg,#A99CE3,#6E59C7)" : "var(--track)",
            }}
          />
        ))}
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10.5, color: "var(--text-faint)", marginTop: 4, fontFamily: "var(--font-mono)" }}>
        <span>{u.days[0]?.date.slice(5)}</span>
        <span>today</span>
      </div>

      {/* per-group reply caps */}
      <div style={{ fontSize: 12, fontWeight: 600, color: "var(--text-dim)", margin: "20px 0 8px" }}>
        Jemaw's replies today per group · resets 00:00 UTC
      </div>
      <div className="jx-scroll" style={{ display: "grid", gap: 10, maxHeight: 8 * 38, overflowY: "auto", paddingRight: 4 }}>
        {u.groups.map((g) => {
          const off = g.mode === "off" || g.maxPerDay === 0;
          const left = Math.max(0, g.maxPerDay - g.repliesToday);
          return (
            <button
              key={g.groupId}
              onClick={() => navigate(`/groups/${g.groupId}`, { state: { from: { path: "/settings", label: "Bot & Settings" } } })}
              style={{ display: "grid", gridTemplateColumns: "1fr 150px 90px", gap: 12, alignItems: "center", background: "none", border: "none", color: "var(--text)", padding: 0, textAlign: "left", cursor: "pointer" }}
            >
              <span style={{ fontSize: 13, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{g.groupName}</span>
              <span style={{ height: 6, borderRadius: 99, background: "var(--track)", overflow: "hidden" }}>
                {!off && (
                  <span style={{ display: "block", height: "100%", width: `${Math.min(100, (g.repliesToday / g.maxPerDay) * 100)}%`, background: tone(left, g.maxPerDay), borderRadius: 99 }} />
                )}
              </span>
              <span style={{ fontSize: 12, color: off || g.mutedUntil ? "var(--text-faint)" : "var(--text-dim)", textAlign: "right", fontVariantNumeric: "tabular-nums" }}>
                {off ? "humor off" : g.mutedUntil ? "muted" : `${g.repliesToday} / ${g.maxPerDay}`}
              </span>
            </button>
          );
        })}
      </div>

      {u.byModel.length > 0 && (
        <>
          <div style={{ fontSize: 12, fontWeight: 600, color: "var(--text-dim)", margin: "20px 0 8px" }}>Replies by model · last 7 days</div>
          {u.byModel.map((m) => (
            <div key={m.model} style={{ display: "flex", gap: 10, fontSize: 12.5, padding: "3px 0" }}>
              <code style={{ flex: 1, fontFamily: "var(--font-mono)", color: "var(--accent-soft)" }}>{m.model}</code>
              <span style={{ color: "var(--text-dim)" }}>{m.calls} replies</span>
              <span style={{ width: 90, textAlign: "right", color: "var(--text-dim)" }}>{fmtCompact(m.tokens)} tokens</span>
            </div>
          ))}
        </>
      )}
      {isLoading && <Loader size={16} />}
    </Card>
  );
}
