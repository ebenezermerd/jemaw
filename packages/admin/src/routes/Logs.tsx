import { useQuery } from "@tanstack/react-query";
import { api } from "../lib/api.js";
import type { AdminAuditEntryDto } from "@jemaw/shared/types";
import { CenteredMessage } from "../ui/primitives.js";
import { useState } from "react";

// ─── helpers ─────────────────────────────────────────────────────────────────

function fmtTimestamp(iso: string): string {
  const d = new Date(iso);
  const date = d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  const time = d.toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
  return `${date} · ${time}`;
}

// ─── severity from action ─────────────────────────────────────────────────────

type Severity = "ok" | "info" | "warn" | "alert";

const SEVERITY_CFG: Record<Severity, { label: string; color: string; bg: string }> = {
  ok:    { label: "ok",    color: "#2DD4A7", bg: "rgba(45,212,167,.12)" },
  info:  { label: "info",  color: "#5BA8E0", bg: "rgba(91,168,224,.12)" },
  warn:  { label: "warn",  color: "#E0B23C", bg: "rgba(224,178,60,.12)" },
  alert: { label: "alert", color: "#F2685F", bg: "rgba(242,104,95,.12)" },
};

function deriveSeverity(action: string): Severity {
  if (action.includes("suspend") || action.includes("flag")) return "warn";
  if (action.includes("activate") || action.includes("settle")) return "ok";
  if (action.includes("alert") || action.includes("abuse")) return "alert";
  return "info";
}

// ─── event category for filter tabs ──────────────────────────────────────────

type Category = "all" | "auth" | "data" | "security";

function deriveCategory(action: string): Category {
  if (action.startsWith("user.") || action.startsWith("config.")) return "security";
  if (action.startsWith("announcement.") || action.startsWith("expense.")) return "data";
  if (action.includes("signin") || action.includes("login") || action.includes("auth")) return "auth";
  return "data";
}

// ─── actor display ────────────────────────────────────────────────────────────

function fmtActor(e: AdminAuditEntryDto): string {
  if (!e.actorEmail) return "system";
  // Extract first name from email: abel.tadesse@x.com → Abel T.
  const local = e.actorEmail.split("@")[0] ?? e.actorEmail;
  const parts = local.split(/[._-]/);
  if (parts.length >= 2) {
    return `admin · ${parts[0]![0]!.toUpperCase()}${parts[0]!.slice(1)} ${parts[1]![0]!.toUpperCase()}.`;
  }
  return `admin · ${local}`;
}

// ─── source display ───────────────────────────────────────────────────────────

function fmtSource(e: AdminAuditEntryDto): string {
  if (!e.actorEmail) return "bot · webhook";
  return "admin · console";
}

// ─── human-readable action text ───────────────────────────────────────────────

function fmtAction(e: AdminAuditEntryDto): string {
  const id = e.targetId ?? "";
  switch (e.action) {
    case "user.suspend":   return `Suspended user${id ? ` ${id}` : ""}`;
    case "user.activate":  return `Activated user${id ? ` ${id}` : ""}`;
    case "announcement.draft":  return "Saved announcement as draft";
    case "announcement.queue":  return "Queued announcement for broadcast";
    case "config.update":  return `Updated config key${id ? ` "${id}"` : ""}`;
    default: {
      // Humanise snake_case action string
      return e.action
        .replace(/\./g, " · ")
        .replace(/_/g, " ")
        .replace(/^\w/, (c) => c.toUpperCase());
    }
  }
}

// ─── LOGS PAGE ────────────────────────────────────────────────────────────────

const COLS = "1.2fr 1.3fr 2.2fr 1.2fr 0.9fr";

const CATEGORY_FILTERS: { key: Category; label: string }[] = [
  { key: "all",      label: "All events" },
  { key: "auth",     label: "Auth" },
  { key: "data",     label: "Data" },
  { key: "security", label: "Security" },
];

export function Logs() {
  const [category, setCategory] = useState<Category>("all");

  const { data: logs = [], isLoading, error } = useQuery({
    queryKey: ["logs"],
    queryFn: () => api.get<AdminAuditEntryDto[]>("/api/admin/logs?limit=100"),
  });

  if (isLoading) return <CenteredMessage>Loading activity…</CenteredMessage>;
  if (error) return <CenteredMessage>Could not load the audit log.</CenteredMessage>;

  const rows = logs.filter(
    (e) => category === "all" || deriveCategory(e.action) === category,
  );

  function exportLogs() {
    const cols = ["Timestamp", "Actor", "Action", "Target", "Source"];
    const lines = [
      cols.join(","),
      ...rows.map((e) =>
        [
          `"${fmtTimestamp(e.createdAt)}"`,
          `"${fmtActor(e)}"`,
          `"${fmtAction(e)}"`,
          e.targetId ?? "",
          fmtSource(e),
        ].join(","),
      ),
    ];
    const blob = new Blob([lines.join("\n")], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "jemaw-audit-log.csv";
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div>
      {/* toolbar */}
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 18 }}>
        {/* category filter pills */}
        <div style={{ display: "flex", gap: 7 }}>
          {CATEGORY_FILTERS.map(({ key, label }) => {
            const active = category === key;
            return (
              <button
                key={key}
                onClick={() => setCategory(key)}
                style={{
                  fontSize: 13,
                  fontWeight: 600,
                  color: active ? "#fff" : "rgba(244,242,251,.6)",
                  background: active ? "#6E59C7" : "transparent",
                  border: active ? "none" : "1px solid rgba(255,255,255,.1)",
                  padding: "9px 14px",
                  borderRadius: 9,
                  cursor: "pointer",
                }}
              >
                {label}
              </button>
            );
          })}
        </div>

        <div style={{ flex: 1 }} />

        {/* export */}
        <button
          onClick={exportLogs}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            fontSize: 13,
            fontWeight: 700,
            color: "#fff",
            background: "#16151F",
            border: "1px solid rgba(255,255,255,.1)",
            padding: "9px 14px",
            borderRadius: 9,
            cursor: "pointer",
          }}
        >
          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 3v12" />
            <path d="M7 10l5 5 5-5" />
            <path d="M5 21h14" />
          </svg>
          Export logs
        </button>
      </div>

      {/* table */}
      <div
        style={{
          background: "#16151F",
          border: "1px solid rgba(255,255,255,.07)",
          borderRadius: 16,
          overflow: "hidden",
        }}
      >
        {/* col headers */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: COLS,
            gap: 12,
            padding: "13px 20px",
            borderBottom: "1px solid rgba(255,255,255,.07)",
            fontFamily: "var(--font-mono)",
            fontSize: 10,
            letterSpacing: ".1em",
            textTransform: "uppercase",
            color: "rgba(244,242,251,.4)",
          }}
        >
          <span>Timestamp</span>
          <span>Actor</span>
          <span>Action</span>
          <span>IP / source</span>
          <span>Severity</span>
        </div>

        {rows.length === 0 ? (
          <CenteredMessage>
            {category !== "all" ? "No events in this category." : "No admin actions recorded yet."}
          </CenteredMessage>
        ) : (
          rows.map((e, i) => {
            const sev = deriveSeverity(e.action);
            const cfg = SEVERITY_CFG[sev];
            return (
              <div
                key={e.id}
                style={{
                  display: "grid",
                  gridTemplateColumns: COLS,
                  gap: 12,
                  padding: "13px 20px",
                  borderBottom: i < rows.length - 1 ? "1px solid rgba(255,255,255,.04)" : "none",
                  alignItems: "center",
                  fontVariantNumeric: "tabular-nums",
                }}
              >
                {/* timestamp */}
                <span
                  style={{
                    fontFamily: "var(--font-mono)",
                    fontSize: 12,
                    color: "rgba(244,242,251,.6)",
                  }}
                >
                  {fmtTimestamp(e.createdAt)}
                </span>

                {/* actor */}
                <span style={{ fontSize: 13 }}>{fmtActor(e)}</span>

                {/* action */}
                <span style={{ fontSize: 13, color: "rgba(244,242,251,.75)" }}>
                  {fmtAction(e)}
                </span>

                {/* source */}
                <span
                  style={{
                    fontFamily: "var(--font-mono)",
                    fontSize: 12,
                    color: "rgba(244,242,251,.5)",
                  }}
                >
                  {fmtSource(e)}
                </span>

                {/* severity pill */}
                <span>
                  <span
                    style={{
                      fontSize: 11,
                      fontWeight: 700,
                      color: cfg.color,
                      background: cfg.bg,
                      padding: "3px 9px",
                      borderRadius: 7,
                    }}
                  >
                    {cfg.label}
                  </span>
                </span>
              </div>
            );
          })
        )}
      </div>

      {/* footer count */}
      {rows.length > 0 && (
        <div style={{ marginTop: 12, fontSize: 13, color: "rgba(244,242,251,.35)" }}>
          {rows.length.toLocaleString()} event{rows.length !== 1 ? "s" : ""}
          {category !== "all" ? ` · ${category}` : ""}
        </div>
      )}
    </div>
  );
}
