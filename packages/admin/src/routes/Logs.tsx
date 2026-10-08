/**
 * Activity & Logs: one feed of console actions, AI scans, bot replies, drafts
 * and settlements from /api/admin/activity, filtered and paged on the server.
 */
import { useEffect, useState } from "react";
import { keepPreviousData, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { api } from "../lib/api.js";
import type {
  AdminActivityItemDto,
  AdminActivityPageDto,
  AdminActivitySeverity,
  AdminActivitySource,
  AdminGroupDto,
} from "@jemaw/shared/types";
import { Busy, Loader, SkeletonRows } from "../ui/Loader.js";
import { DEFAULT_PAGE_SIZE, TableFooter } from "../ui/Pager.js";
import { CenteredMessage } from "../ui/primitives.js";

function fmtTimestamp(iso: string): string {
  const d = new Date(iso);
  const date = d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  const time = d.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false });
  return `${date} · ${time}`;
}

const SOURCES: { key: AdminActivitySource | "all"; label: string }[] = [
  { key: "all", label: "All" },
  { key: "console", label: "Console" },
  { key: "scan", label: "AI scans" },
  { key: "reply", label: "Bot replies" },
  { key: "draft", label: "Drafts" },
  { key: "settlement", label: "Settlements" },
];

const SOURCE_LABEL: Record<AdminActivitySource, string> = {
  console: "admin · console",
  scan: "bot · AI scan",
  reply: "bot · reply",
  draft: "bot · draft",
  settlement: "member · settle",
};

const SEVERITY_CFG: Record<AdminActivitySeverity, { color: string; bg: string }> = {
  info: { color: "#5BA8E0", bg: "rgba(91,168,224,.12)" },
  warn: { color: "#E0B23C", bg: "rgba(224,178,60,.12)" },
  error: { color: "#F2685F", bg: "rgba(242,104,95,.12)" },
};

const COLS = "1.15fr 1.2fr 2.6fr 1.1fr 1fr 0.7fr";

export function Logs() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [source, setSource] = useState<AdminActivitySource | "all">("all");
  const [severity, setSeverity] = useState<AdminActivitySeverity | "all">("all");
  const [groupId, setGroupId] = useState<string>("");
  const [offset, setOffset] = useState(0);
  const [limit, setLimit] = useState(DEFAULT_PAGE_SIZE);
  const [open, setOpen] = useState<string | null>(null);

  useEffect(() => setOffset(0), [source, severity, groupId, limit]);

  const params = new URLSearchParams({ limit: String(limit), offset: String(offset) });
  if (source !== "all") params.set("source", source);
  if (severity !== "all") params.set("severity", severity);
  if (groupId) params.set("groupId", groupId);

  const { data, isLoading, isFetching, isPlaceholderData, error, dataUpdatedAt } = useQuery({
    queryKey: ["activity", params.toString()],
    queryFn: () => api.get<AdminActivityPageDto>(`/api/admin/activity?${params}`),
    placeholderData: keepPreviousData,
    refetchInterval: 30_000,
  });
  const { data: groups = [] } = useQuery({
    queryKey: ["groups"],
    queryFn: () => api.get<AdminGroupDto[]>("/api/admin/groups"),
  });

  const rows = data?.items ?? [];
  const total = data?.total ?? 0;
  const busy = isFetching && isPlaceholderData;
  const refreshing = isFetching && !isPlaceholderData && !isLoading;

  function exportLogs() {
    const cols = ["Timestamp", "Source", "Severity", "Group", "Actor", "Event"];
    const esc = (v: string | null) => `"${(v ?? "").replace(/"/g, '""')}"`;
    const lines = [
      cols.join(","),
      ...rows.map((e) => [esc(e.at), e.source, e.severity, esc(e.groupName), esc(e.actor), esc(e.summary)].join(",")),
    ];
    const blob = new Blob([lines.join("\n")], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "jemaw-activity.csv";
    a.click();
    URL.revokeObjectURL(url);
  }

  if (error) return <CenteredMessage>Could not load activity.</CenteredMessage>;

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 18, flexWrap: "wrap" }}>
        <div role="tablist" style={{ display: "flex", gap: 7, flexWrap: "wrap" }}>
          {SOURCES.map(({ key, label }) => {
            const active = source === key;
            return (
              <button
                key={key}
                role="tab"
                aria-selected={active}
                onClick={() => setSource(key)}
                style={{
                  fontSize: 13,
                  fontWeight: 600,
                  color: active ? "#fff" : "rgba(244,242,251,.6)",
                  background: active ? "#6E59C7" : "transparent",
                  border: active ? "none" : "1px solid rgba(255,255,255,.1)",
                  padding: "8px 13px",
                  borderRadius: 9,
                  cursor: "pointer",
                }}
              >
                {label}
              </button>
            );
          })}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginLeft: "auto", flexWrap: "wrap" }}>
          <select aria-label="Severity" value={severity} onChange={(e) => setSeverity(e.target.value as AdminActivitySeverity | "all")} style={selectStyle}>
            <option value="all">Any severity</option>
            <option value="info">Info</option>
            <option value="warn">Warnings</option>
            <option value="error">Errors</option>
          </select>
          <select aria-label="Group" value={groupId} onChange={(e) => setGroupId(e.target.value)} style={selectStyle}>
            <option value="">All groups</option>
            {groups.map((g) => (
              <option key={g.id} value={g.id}>
                {g.name}
              </option>
            ))}
          </select>
          <button
            onClick={() => void qc.invalidateQueries({ queryKey: ["activity"] })}
            title={dataUpdatedAt ? `Updated ${new Date(dataUpdatedAt).toLocaleTimeString()}` : undefined}
            style={{ ...selectStyle, display: "flex", alignItems: "center", gap: 7, cursor: "pointer" }}
          >
            {refreshing ? <Loader size={14} /> : <span aria-hidden>↻</span>}
            Refresh
          </button>
          <button onClick={exportLogs} style={{ ...selectStyle, cursor: "pointer" }}>
            Export
          </button>
        </div>
      </div>

      <div style={{ background: "#16151F", border: "1px solid rgba(255,255,255,.07)", borderRadius: 16, overflow: "hidden" }}>
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
          <span>Time</span>
          <span>Actor</span>
          <span>Event</span>
          <span>Group</span>
          <span>Source</span>
          <span>Level</span>
        </div>
        <Busy busy={busy}>
          {isLoading ? (
            <SkeletonRows cols={COLS} count={10} />
          ) : rows.length === 0 ? (
            <CenteredMessage>{source !== "all" || severity !== "all" || groupId ? "Nothing matches these filters." : "No activity yet."}</CenteredMessage>
          ) : (
            rows.map((e, i) => (
              <ActivityRow
                key={`${e.source}-${e.id}`}
                e={e}
                last={i === rows.length - 1}
                open={open === `${e.source}-${e.id}`}
                onToggle={() => setOpen((o) => (o === `${e.source}-${e.id}` ? null : `${e.source}-${e.id}`))}
                onGroup={e.groupId ? () => navigate(`/groups/${e.groupId}`, { state: { from: { path: "/logs", label: "Activity & Logs" } } }) : undefined}
              />
            ))
          )}
        </Busy>
        {!isLoading && <TableFooter offset={offset} limit={limit} total={total} onPage={setOffset} onLimit={setLimit} busy={busy} noun="events" />}
      </div>
    </div>
  );
}

function ActivityRow({
  e,
  last,
  open,
  onToggle,
  onGroup,
}: {
  e: AdminActivityItemDto;
  last: boolean;
  open: boolean;
  onToggle: () => void;
  onGroup?: () => void;
}) {
  const sev = SEVERITY_CFG[e.severity];
  return (
    <div style={{ borderBottom: last ? "none" : "1px solid rgba(255,255,255,.04)" }}>
      <div
        className="jx-row"
        onClick={onToggle}
        style={{ display: "grid", gridTemplateColumns: COLS, gap: 12, padding: "12px 20px", alignItems: "center", cursor: "pointer" }}
      >
        <span style={{ fontSize: 12, color: "rgba(244,242,251,.55)", fontFamily: "var(--font-mono)" }}>{fmtTimestamp(e.at)}</span>
        <span style={{ fontSize: 13, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{e.actor ?? "system"}</span>
        <span style={{ fontSize: 13, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={e.summary}>
          {e.summary}
        </span>
        <span>
          {e.groupName ? (
            <button
              onClick={(ev) => {
                ev.stopPropagation();
                onGroup?.();
              }}
              style={{ background: "none", border: "none", padding: 0, color: "#A99CE3", fontSize: 13, cursor: "pointer", textAlign: "left" }}
            >
              {e.groupName}
            </button>
          ) : (
            <span style={{ color: "rgba(244,242,251,.35)", fontSize: 13 }}>—</span>
          )}
        </span>
        <span style={{ fontSize: 12, color: "rgba(244,242,251,.55)", fontFamily: "var(--font-mono)" }}>{SOURCE_LABEL[e.source]}</span>
        <span>
          <span style={{ fontSize: 11, fontWeight: 700, color: sev.color, background: sev.bg, padding: "3px 9px", borderRadius: 7 }}>{e.severity}</span>
        </span>
      </div>
      {open && (
        <pre
          style={{
            margin: "0 20px 14px",
            padding: 14,
            background: "var(--bg-panel)",
            border: "1px solid var(--hairline)",
            borderRadius: 11,
            fontSize: 12,
            color: "var(--text-dim)",
            fontFamily: "var(--font-mono)",
            whiteSpace: "pre-wrap",
            wordBreak: "break-word",
          }}
        >
          {JSON.stringify({ action: e.action, ...e.detail }, null, 2)}
        </pre>
      )}
    </div>
  );
}

const selectStyle = {
  background: "#16151F",
  border: "1px solid rgba(255,255,255,.1)",
  borderRadius: 9,
  padding: "8px 11px",
  fontSize: 13,
  color: "var(--text)",
  outline: "none",
} as const;
