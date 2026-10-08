/**
 * Bot & Settings: live bot health, the switches the bot obeys (app_config
 * bot.* keys, re-read by the bot every minute), and the raw config editor.
 */
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../lib/api.js";
import type { AppConfigDto, UpdateConfigInput } from "@jemaw/shared/types";
import type { BotRuntimeConfig } from "@jemaw/shared/runtimeConfig";
import { GhostButton, fieldStyle } from "../ui/Dialog.js";
import { Loader, SkeletonList } from "../ui/Loader.js";
import { Card, PrimaryButton } from "../ui/primitives.js";
import { ago, statusDetail, useBotStatus } from "../ui/BotStatus.js";
import { NumberField, ToggleRow } from "./GroupManage.js";

const errText = (e: unknown) => (e instanceof Error ? e.message : "Something went wrong.");

export function Settings() {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "1.2fr 1fr", gap: 16, alignItems: "start" }}>
      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        <BotSwitches />
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        <BotHealth />
        <AdvancedConfig />
      </div>
    </div>
  );
}

function BotHealth() {
  const { data: s, isLoading, isFetching, refetch } = useBotStatus();
  const tone = s?.health === "ok" ? "var(--success)" : s?.health === "warn" ? "var(--warn)" : "var(--danger)";
  return (
    <Card>
      <div style={{ display: "flex", alignItems: "center", marginBottom: 14 }}>
        <div style={{ fontSize: 15, fontWeight: 700, flex: 1 }}>Bot health</div>
        <GhostButton onClick={() => void refetch()} disabled={isFetching}>
          {isFetching ? "Checking…" : "Check now"}
        </GhostButton>
      </div>
      {isLoading || !s ? (
        <SkeletonList count={3} height={22} padding={0} />
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 10, fontSize: 13 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ width: 9, height: 9, borderRadius: "50%", background: tone }} />
            <b style={{ color: tone, textTransform: "capitalize" }}>{s.health === "ok" ? "Healthy" : s.health === "warn" ? "Needs a look" : "Down"}</b>
            <span style={{ color: "var(--text-dim)" }}>· {statusDetail(s)}</span>
          </div>
          <Row k="Bot" v={s.username ? `@${s.username}` : "—"} />
          <Row k="Last heartbeat" v={s.heartbeat ? `${ago(s.heartbeat.at)}${s.heartbeat.version ? ` · build ${s.heartbeat.version}` : ""}` : "none yet"} />
          <Row k="Webhook" v={s.webhook?.url ? s.webhook.url.replace(/^https?:\/\//, "") : "not set (polling)"} />
          <Row k="Pending updates" v={s.webhook ? String(s.webhook.pendingUpdates) : "—"} />
          {s.webhook?.lastErrorMessage && (
            <Row k="Last webhook error" v={`${s.webhook.lastErrorMessage} · ${s.webhook.lastErrorAt ? ago(s.webhook.lastErrorAt) : ""}`} danger />
          )}
          <div style={{ fontSize: 11.5, color: "var(--text-faint)", lineHeight: 1.5 }}>
            The free Render instance sleeps when idle, so a heartbeat older than 15 minutes usually means it is asleep. A message to the bot wakes it.
          </div>
        </div>
      )}
    </Card>
  );
}

function Row({ k, v, danger }: { k: string; v: string; danger?: boolean }) {
  return (
    <div style={{ display: "flex", gap: 12 }}>
      <span style={{ width: 130, color: "var(--text-dim)", flex: "none" }}>{k}</span>
      <span style={{ color: danger ? "var(--danger)" : "var(--text)", wordBreak: "break-all", fontFamily: "var(--font-mono)", fontSize: 12.5 }}>{v}</span>
    </div>
  );
}

const MODELS = ["openai/gpt-oss-120b", "openai/gpt-oss-20b", "llama-3.3-70b-versatile", "llama-3.1-8b-instant"];

function BotSwitches() {
  const qc = useQueryClient();
  const [pending, setPending] = useState<string | null>(null);
  const { data: c, isLoading } = useQuery({
    queryKey: ["bot-config"],
    queryFn: () => api.get<BotRuntimeConfig>("/api/admin/bot/config"),
  });
  const save = useMutation({
    mutationFn: (patch: Partial<BotRuntimeConfig>) => api.patch<BotRuntimeConfig>("/api/admin/bot/config", patch),
    onSuccess: (next) => {
      qc.setQueryData(["bot-config"], next);
      void qc.invalidateQueries({ queryKey: ["config"] });
      void qc.invalidateQueries({ queryKey: ["activity"] });
    },
    onSettled: () => setPending(null),
  });
  const set = (key: string, patch: Partial<BotRuntimeConfig>) => {
    setPending(key);
    save.mutate(patch);
  };
  const [maintenance, setMaintenance] = useState<string | null>(null);
  const [model, setModel] = useState<string | null>(null);

  return (
    <Card>
      <div style={{ display: "flex", alignItems: "center", marginBottom: 6 }}>
        <div style={{ fontSize: 15, fontWeight: 700, flex: 1 }}>Bot &amp; AI switches</div>
        {save.isPending && <Loader size={18} />}
      </div>
      <div style={{ fontSize: 12, color: "var(--text-faint)", marginBottom: 14, lineHeight: 1.5 }}>
        Apply to every group. The bot picks up changes within a minute. Per-group personality lives on each group's page.
      </div>
      {isLoading || !c ? (
        <SkeletonList count={5} height={40} padding={0} />
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <ToggleRow label="AI expense scans" hint="Reading the chat for new expenses and payments" on={c.scanEnabled} busy={pending === "scan"} disabled={save.isPending} onChange={(v) => set("scan", { scanEnabled: v })} />
          <ToggleRow label="AI chat & banter" hint="Replies, roasts and understanding questions. Plain ledger answers keep working." on={c.chatEnabled} busy={pending === "chat"} disabled={save.isPending} onChange={(v) => set("chat", { chatEnabled: v })} />
          <ToggleRow label="Weekly digest" hint="The summary each group gets every 7 days" on={c.weeklyDigestEnabled} busy={pending === "digest"} disabled={save.isPending} onChange={(v) => set("digest", { weeklyDigestEnabled: v })} />

          <div style={{ display: "flex", gap: 14, alignItems: "flex-end", flexWrap: "wrap", marginTop: 10 }}>
            <NumberField label="Seconds between scans (per group)" value={c.scanCooldownSeconds} min={5} max={600} disabled={save.isPending} onCommit={(n) => set("cooldown", { scanCooldownSeconds: n })} />
            <label style={{ display: "flex", flexDirection: "column", gap: 6, flex: 1, minWidth: 220 }}>
              <span style={{ fontSize: 12, fontWeight: 600, color: "var(--text-dim)" }}>AI model (Groq)</span>
              <div style={{ display: "flex", gap: 8 }}>
                <input
                  list="jemaw-models"
                  value={model ?? c.model ?? ""}
                  placeholder="Default from the server env"
                  onChange={(e) => setModel(e.target.value)}
                  style={{ ...fieldStyle, fontFamily: "var(--font-mono)", fontSize: 13 }}
                />
                <datalist id="jemaw-models">
                  {MODELS.map((m) => (
                    <option key={m} value={m} />
                  ))}
                </datalist>
                <GhostButton
                  disabled={model === null || model === (c.model ?? "") || save.isPending}
                  onClick={() => {
                    set("model", { model: model?.trim() || null });
                    setModel(null);
                  }}
                >
                  Save
                </GhostButton>
              </div>
            </label>
          </div>

          <label style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 14 }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: "var(--text-dim)" }}>Maintenance notice</span>
            <textarea
              rows={2}
              maxLength={500}
              value={maintenance ?? c.maintenanceMessage ?? ""}
              placeholder="Empty = normal. When set, commands and mentions get this reply instead."
              onChange={(e) => setMaintenance(e.target.value)}
              style={{ ...fieldStyle, resize: "vertical" }}
            />
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              {c.maintenanceMessage && <span style={{ fontSize: 12, color: "var(--warn)", flex: 1 }}>Maintenance mode is on.</span>}
              <div style={{ flex: c.maintenanceMessage ? undefined : 1 }} />
              {c.maintenanceMessage && (
                <GhostButton onClick={() => { set("maint", { maintenanceMessage: null }); setMaintenance(null); }} disabled={save.isPending}>
                  Turn off
                </GhostButton>
              )}
              <GhostButton
                disabled={maintenance === null || maintenance.trim() === (c.maintenanceMessage ?? "") || save.isPending}
                onClick={() => {
                  set("maint", { maintenanceMessage: maintenance?.trim() || null });
                  setMaintenance(null);
                }}
              >
                Save notice
              </GhostButton>
            </div>
          </label>
          {save.isError && <div style={{ fontSize: 12, color: "var(--danger)" }}>{errText(save.error)}</div>}
        </div>
      )}
    </Card>
  );
}

function AdvancedConfig() {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [key, setKey] = useState("");
  const [value, setValue] = useState("");
  const [parseError, setParseError] = useState<string | null>(null);
  const { data, isLoading } = useQuery({
    queryKey: ["config"],
    queryFn: () => api.get<AppConfigDto[]>("/api/admin/config"),
    enabled: open,
  });
  const save = useMutation({
    mutationFn: (input: UpdateConfigInput) => api.patch("/api/admin/config", input),
    onSuccess: () => {
      setKey("");
      setValue("");
      void qc.invalidateQueries({ queryKey: ["config"] });
      void qc.invalidateQueries({ queryKey: ["bot-config"] });
    },
  });
  function onSave() {
    let parsed: unknown;
    try {
      parsed = JSON.parse(value);
      setParseError(null);
    } catch {
      setParseError("Value must be valid JSON (use quotes for strings).");
      return;
    }
    save.mutate({ key: key.trim(), value: parsed });
  }
  return (
    <Card style={{ padding: 0, overflow: "hidden" }}>
      <button
        onClick={() => setOpen((o) => !o)}
        style={{ width: "100%", display: "flex", alignItems: "center", padding: "18px 20px", background: "none", border: "none", color: "var(--text)", cursor: "pointer", fontSize: 15, fontWeight: 700, textAlign: "left" }}
      >
        <span style={{ flex: 1 }}>Advanced: raw configuration</span>
        <span style={{ color: "var(--text-dim)" }}>{open ? "▾" : "▸"}</span>
      </button>
      {open && (
        <>
          <div style={{ padding: "0 20px 16px", display: "flex", flexDirection: "column", gap: 10 }}>
            <input value={key} onChange={(e) => setKey(e.target.value)} placeholder="key" style={{ ...fieldStyle, fontFamily: "var(--font-mono)", fontSize: 13 }} />
            <textarea value={value} onChange={(e) => setValue(e.target.value)} placeholder={'JSON value, e.g. true or "text"'} rows={3} style={{ ...fieldStyle, fontFamily: "var(--font-mono)", fontSize: 13, resize: "vertical" }} />
            {parseError && <div style={{ fontSize: 12, color: "var(--danger)" }}>{parseError}</div>}
            <PrimaryButton onClick={onSave} disabled={key.trim().length === 0 || save.isPending}>
              Save setting
            </PrimaryButton>
            <div style={{ fontSize: 11.5, color: "var(--text-faint)" }}>
              The admin allowlist lives under <code>admins</code>. Prefer the switches above for <code>bot.*</code> keys.
            </div>
          </div>
          {isLoading && <SkeletonList count={4} height={30} />}
          <div className="jx-scroll" style={{ maxHeight: 360, overflowY: "auto" }}>
            {data?.map((c) => (
              <div key={c.key} style={{ display: "flex", alignItems: "flex-start", gap: 12, padding: "11px 20px", borderTop: "1px solid rgba(255,255,255,.05)" }}>
                <code style={{ fontFamily: "var(--font-mono)", fontSize: 12.5, color: "var(--accent-soft)", minWidth: 150 }}>{c.key}</code>
                <code style={{ fontFamily: "var(--font-mono)", fontSize: 12, color: "var(--text-dim)", flex: 1, wordBreak: "break-all" }}>{JSON.stringify(c.value)}</code>
              </div>
            ))}
          </div>
        </>
      )}
    </Card>
  );
}
