import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../lib/api.js";
import type { AdminUserDto, AdminExpenseDto } from "@jemaw/shared/types";
import { StatusPill, CenteredMessage } from "../ui/primitives.js";

// ─── helpers ──────────────────────────────────────────────────────────────────

function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function fmtDateTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" }) +
    " · " + d.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" });
}

function relativeTime(iso: string | null): string {
  if (!iso) return "Never";
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 2) return "Just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days === 1) return "Yesterday";
  if (days < 30) return `${days}d ago`;
  if (days < 365) return `${Math.floor(days / 30)}mo ago`;
  return `${Math.floor(days / 365)}y ago`;
}

function initials(name: string): string {
  return name.split(" ").slice(0, 2).map((w) => w[0]?.toUpperCase() ?? "").join("");
}

// Deterministic avatar gradient based on first character — matches the design's per-user colors
const GRADIENTS: Record<string, [string, string, string?]> = {
  A: ["#6E59C7", "#A99CE3"],
  B: ["#1C5E4B", "#2DD4A7", "#063226"],
  C: ["#2A5C8E", "#5BA8E0"],
  D: ["#C99A3E", "#E9C36B", "#3a2a08"],
  E: ["#1C5E4B", "#2DD4A7", "#063226"],
  F: ["#6E59C7", "#A99CE3"],
  G: ["#4a3a5a", "#8A78D6"],
  H: ["#2A5C8E", "#5BA8E0"],
  I: ["#6E59C7", "#A99CE3"],
  J: ["#1C5E4B", "#2DC4B0"],
  K: ["#C99A3E", "#E9C36B", "#3a2a08"],
  L: ["#3a3850", "#8E7BE0"],
  M: ["#5a3a4a", "#F2685F"],
  N: ["#6E59C7", "#A99CE3"],
  O: ["#2A5C8E", "#5BA8E0"],
  P: ["#C99A3E", "#E9C36B", "#3a2a08"],
  Q: ["#4a3a5a", "#8A78D6"],
  R: ["#2A5C8E", "#5BA8E0"],
  S: ["#2A5C8E", "#5BA8E0"],
  T: ["#3a3850", "#8E7BE0"],
  U: ["#6E59C7", "#A99CE3"],
  V: ["#1C5E4B", "#2DC4B0"],
  W: ["#C99A3E", "#E9C36B"],
  X: ["#4a3a5a", "#8A78D6"],
  Y: ["#1C5E4B", "#2DD4A7"],
  Z: ["#5a3a4a", "#F2685F"],
};

function getAvatarStyle(name: string): { bg: string; color: string } {
  const key = name[0]?.toUpperCase() ?? "A";
  const g = GRADIENTS[key] ?? ["#6E59C7", "#A99CE3"];
  return {
    bg: `linear-gradient(140deg,${g[0]},${g[1]})`,
    color: g[2] ?? "#fff",
  };
}

// ─── group icon (three-circle mark) ──────────────────────────────────────────

function GroupIcon({ size = 34 }: { size?: number }) {
  return (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: size * 0.29,
        background: "linear-gradient(150deg,#3B2C84,#6E59C7 65%,#8A78D6)",
        position: "relative",
        overflow: "hidden",
        flex: "none",
      }}
    >
      <svg viewBox="0 0 100 100" style={{ position: "absolute", inset: size * 0.17 }}>
        <circle cx="50" cy="40" r="23" fill="#F2EFFA" opacity=".9" style={{ mixBlendMode: "screen" }} />
        <circle cx="37" cy="62" r="23" fill="#C8BFEF" opacity=".9" style={{ mixBlendMode: "screen" }} />
        <circle cx="63" cy="62" r="23" fill="#A99CE3" opacity=".9" style={{ mixBlendMode: "screen" }} />
      </svg>
    </div>
  );
}

// ─── USER DETAIL PAGE ────────────────────────────────────────────────────────

function UserDetail({
  user,
  expenses,
  onBack,
  onToggle,
  isPending,
}: {
  user: AdminUserDto;
  expenses: AdminExpenseDto[];
  onBack: () => void;
  onToggle: () => void;
  isPending: boolean;
}) {
  const { bg, color } = getAvatarStyle(user.displayName);

  const userExpenses = expenses
    .filter((e) => e.payerName === user.displayName && !e.voided)
    .slice(0, 6);

  const totalPaid = userExpenses.reduce((s, e) => s + Number(e.amount), 0);

  // Build a fake groups list from expenses (group names they've appeared in)
  const groupMap = new Map<string, { name: string; entries: number; amount: number }>();
  expenses
    .filter((e) => e.payerName === user.displayName && !e.voided)
    .forEach((e) => {
      const g = groupMap.get(e.groupName) ?? { name: e.groupName, entries: 0, amount: 0 };
      g.entries++;
      g.amount += Number(e.amount);
      groupMap.set(e.groupName, g);
    });
  const groups = [...groupMap.values()].sort((a, b) => b.amount - a.amount);

  // Activity timeline from expenses
  const timeline = expenses
    .filter((e) => e.payerName === user.displayName)
    .slice(0, 5)
    .map((e) => ({
      id: e.id,
      dot: e.kind === "loan" ? "#E0B23C" : "#8A78D6",
      text: e.kind === "loan"
        ? <>Recorded loan <b>{Number(e.amount).toLocaleString()} {e.currency}</b> · {e.groupName}</>
        : <>Added expense <b>{e.description} · {Number(e.amount).toLocaleString()} {e.currency}</b></>,
      at: e.occurredAt,
    }));

  return (
    <div>
      {/* back link */}
      <button
        onClick={onBack}
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 7,
          fontSize: 13,
          fontWeight: 600,
          color: "#A99CE3",
          background: "none",
          border: "none",
          cursor: "pointer",
          padding: 0,
          marginBottom: 16,
        }}
      >
        <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M15 18l-6-6 6-6" />
        </svg>
        All users
      </button>

      {/* header card */}
      <div
        style={{
          background: "#16151F",
          border: "1px solid rgba(255,255,255,.07)",
          borderRadius: 18,
          padding: 22,
          display: "flex",
          alignItems: "center",
          gap: 18,
          marginBottom: 18,
        }}
      >
        {/* large circle avatar */}
        <div
          style={{
            width: 64,
            height: 64,
            borderRadius: "50%",
            background: bg,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontWeight: 700,
            fontSize: 24,
            color,
            flex: "none",
          }}
        >
          {initials(user.displayName)}
        </div>

        <div style={{ flex: 1 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <h2
              style={{
                fontFamily: "var(--font-display)",
                fontWeight: 700,
                fontSize: 24,
                letterSpacing: "-.02em",
                margin: 0,
              }}
            >
              {user.displayName}
            </h2>
            <StatusPill status={user.status} />
          </div>
          <div style={{ fontSize: 13, color: "rgba(244,242,251,.5)", marginTop: 3 }}>
            {user.username ? `@${user.username} · ` : ""}
            ID {user.telegramUserId}
            {user.lastActiveAt ? ` · Last active ${fmtDate(user.lastActiveAt)}` : ""}
          </div>
        </div>

        {/* action buttons */}
        <div style={{ display: "flex", gap: 9 }}>
          <span
            style={{
              fontSize: 13,
              fontWeight: 600,
              color: "rgba(244,242,251,.7)",
              border: "1px solid rgba(255,255,255,.12)",
              padding: "9px 14px",
              borderRadius: 9,
              cursor: "default",
            }}
          >
            Message
          </span>
          <button
            onClick={onToggle}
            disabled={isPending}
            style={{
              fontSize: 13,
              fontWeight: 700,
              color: user.isActive ? "#F2685F" : "#2DD4A7",
              border: `1px solid ${user.isActive ? "rgba(242,104,95,.3)" : "rgba(45,212,167,.3)"}`,
              background: "transparent",
              padding: "9px 14px",
              borderRadius: 9,
              cursor: isPending ? "default" : "pointer",
              opacity: isPending ? 0.6 : 1,
            }}
          >
            {isPending ? "Working…" : user.isActive ? "Suspend user" : "Activate user"}
          </button>
        </div>
      </div>

      {/* 4-stat grid */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 16, marginBottom: 18 }}>
        {[
          { value: String(user.groupCount), label: "Groups" },
          {
            value: totalPaid > 0
              ? `${totalPaid.toLocaleString(undefined, { maximumFractionDigits: 0 })} Br`
              : "—",
            label: "Total paid",
          },
          {
            value: "—",
            label: "Net balance",
            accent: "#2DD4A7",
          },
          { value: String(userExpenses.length), label: "Entries logged" },
        ].map(({ value, label, accent }) => (
          <div
            key={label}
            style={{
              background: "#16151F",
              border: "1px solid rgba(255,255,255,.07)",
              borderRadius: 14,
              padding: 16,
            }}
          >
            <div
              style={{
                fontFamily: "var(--font-display)",
                fontWeight: 800,
                fontSize: 24,
                fontVariantNumeric: "tabular-nums",
                color: accent ?? "var(--text)",
                lineHeight: 1,
              }}
            >
              {value}
            </div>
            <div style={{ fontSize: 12, color: "rgba(244,242,251,.5)", marginTop: 6 }}>{label}</div>
          </div>
        ))}
      </div>

      {/* two-column: group memberships + activity */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>

        {/* group memberships */}
        <div
          style={{
            background: "#16151F",
            border: "1px solid rgba(255,255,255,.07)",
            borderRadius: 16,
            overflow: "hidden",
          }}
        >
          <div
            style={{
              padding: "15px 20px",
              borderBottom: "1px solid rgba(255,255,255,.07)",
              fontSize: 15,
              fontWeight: 700,
            }}
          >
            Group memberships
          </div>
          {groups.length === 0 ? (
            <div style={{ padding: "16px 20px", fontSize: 13, color: "rgba(244,242,251,.4)" }}>
              No group data available.
            </div>
          ) : (
            groups.map((g, i) => (
              <div
                key={g.name}
                className="jx-row"
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 11,
                  padding: "13px 20px",
                  borderBottom: i < groups.length - 1 ? "1px solid rgba(255,255,255,.04)" : "none",
                }}
              >
                <GroupIcon size={34} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 14, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {g.name}
                  </div>
                  <div style={{ fontSize: 11, color: "rgba(244,242,251,.45)" }}>
                    Member · {g.entries} {g.entries === 1 ? "entry" : "entries"}
                  </div>
                </div>
                <span
                  style={{
                    fontSize: 13,
                    fontWeight: 700,
                    color: g.amount >= 0 ? "#2DD4A7" : "#F0A640",
                    fontVariantNumeric: "tabular-nums",
                    flex: "none",
                  }}
                >
                  {g.amount >= 0 ? "+" : "−"}{Math.abs(g.amount).toLocaleString(undefined, { maximumFractionDigits: 0 })} Br
                </span>
              </div>
            ))
          )}
        </div>

        {/* recent activity timeline */}
        <div
          style={{
            background: "#16151F",
            border: "1px solid rgba(255,255,255,.07)",
            borderRadius: 16,
            padding: 20,
          }}
        >
          <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 16 }}>Recent activity</div>
          {timeline.length === 0 ? (
            <div style={{ fontSize: 13, color: "rgba(244,242,251,.4)" }}>No activity recorded.</div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              {timeline.map((item, i) => (
                <div key={item.id} style={{ display: "flex", gap: 11 }}>
                  {/* timeline spine */}
                  <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
                    <span
                      style={{
                        width: 9,
                        height: 9,
                        borderRadius: "50%",
                        background: item.dot,
                        flex: "none",
                        marginTop: 3,
                      }}
                    />
                    {i < timeline.length - 1 && (
                      <span
                        style={{
                          flex: 1,
                          width: 2,
                          background: "rgba(255,255,255,.08)",
                          marginTop: 4,
                        }}
                      />
                    )}
                  </div>
                  <div style={{ paddingBottom: i < timeline.length - 1 ? 0 : 0 }}>
                    <div style={{ fontSize: 13 }}>{item.text}</div>
                    <div
                      style={{
                        fontSize: 11,
                        color: "rgba(244,242,251,.4)",
                        marginTop: 2,
                        fontVariantNumeric: "tabular-nums",
                      }}
                    >
                      {fmtDateTime(item.at)}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── USERS LIST ──────────────────────────────────────────────────────────────

const COLS = "2.2fr 1.4fr 1fr 1.1fr 1.1fr 0.6fr";

type Filter = "all" | "active" | "idle" | "new" | "suspended";
const FILTERS: { key: Filter; label: string }[] = [
  { key: "all", label: "All" },
  { key: "active", label: "Active" },
  { key: "suspended", label: "Suspended" },
];

export function Users() {
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [selected, setSelected] = useState<AdminUserDto | null>(null);

  const { data: users = [], isLoading, error } = useQuery({
    queryKey: ["users"],
    queryFn: () => api.get<AdminUserDto[]>("/api/admin/users"),
  });

  const { data: expenses = [] } = useQuery({
    queryKey: ["expenses"],
    queryFn: () => api.get<AdminExpenseDto[]>("/api/admin/expenses"),
  });

  const toggle = useMutation({
    mutationFn: (u: AdminUserDto) =>
      api.post(`/api/admin/users/${u.telegramUserId}/${u.isActive ? "suspend" : "activate"}`),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["users"] }),
  });

  if (isLoading) return <CenteredMessage>Loading users…</CenteredMessage>;
  if (error) return <CenteredMessage>Could not load users.</CenteredMessage>;

  // keep detail in sync after mutation
  const liveSelected = selected
    ? (users.find((u) => u.telegramUserId === selected.telegramUserId) ?? selected)
    : null;

  // ── detail page ────────────────────────────────────────────────────────────
  if (liveSelected) {
    return (
      <UserDetail
        user={liveSelected}
        expenses={expenses}
        onBack={() => setSelected(null)}
        onToggle={() => toggle.mutate(liveSelected)}
        isPending={toggle.isPending}
      />
    );
  }

  // ── list ───────────────────────────────────────────────────────────────────
  const q = search.trim().toLowerCase();
  const rows = users
    .filter((u) => filter === "all" || u.status === filter)
    .filter(
      (u) =>
        !q ||
        u.displayName.toLowerCase().includes(q) ||
        (u.username ?? "").toLowerCase().includes(q) ||
        u.telegramUserId.includes(q),
    );

  const counts: Record<Filter, number> = {
    all: users.length,
    active: users.filter((u) => u.status === "active").length,
    new: users.filter((u) => u.status === "new").length,
    idle: users.filter((u) => u.status === "idle").length,
    suspended: users.filter((u) => u.status === "suspended").length,
  };

  return (
    <div>
      {/* toolbar */}
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 18 }}>
        {/* search */}
        <div
          style={{
            flex: 1,
            background: "#16151F",
            border: "1px solid rgba(255,255,255,.08)",
            borderRadius: 11,
            padding: "10px 13px",
            display: "flex",
            alignItems: "center",
            gap: 10,
            maxWidth: 340,
          }}
        >
          <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="rgba(244,242,251,.4)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="11" cy="11" r="7" />
            <path d="M21 21l-4-4" />
          </svg>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name or @handle…"
            style={{
              flex: 1,
              background: "none",
              border: "none",
              outline: "none",
              fontSize: 14,
              color: "var(--text)",
            }}
          />
        </div>

        {/* status filter pills */}
        <div style={{ display: "flex", gap: 7 }}>
          {FILTERS.map(({ key, label }) => {
            const isActive = filter === key;
            return (
              <button
                key={key}
                onClick={() => setFilter(key)}
                style={{
                  fontSize: 13,
                  fontWeight: 600,
                  color: isActive ? "#fff" : "rgba(244,242,251,.6)",
                  background: isActive ? "#6E59C7" : "transparent",
                  border: isActive ? "none" : "1px solid rgba(255,255,255,.1)",
                  padding: "9px 14px",
                  borderRadius: 9,
                  cursor: "pointer",
                }}
              >
                {label}{isActive && counts[key] > 0 ? ` · ${counts[key].toLocaleString()}` : ""}
              </button>
            );
          })}
        </div>

        {/* group filter chip */}
        <div
          className="jx-chip"
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            fontSize: 13,
            fontWeight: 600,
            color: "rgba(244,242,251,.7)",
            background: "#16151F",
            border: "1px solid rgba(255,255,255,.1)",
            padding: "9px 13px",
            borderRadius: 9,
            cursor: "pointer",
          }}
        >
          <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="#A99CE3" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="9" r="3" />
            <circle cx="6" cy="14" r="2.2" />
            <circle cx="18" cy="14" r="2.2" />
          </svg>
          All groups
          <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="rgba(244,242,251,.5)" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="6 9 12 15 18 9" />
          </svg>
        </div>

        <div style={{ flex: 1 }} />

        {/* export */}
        <div
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
          Export CSV
        </div>
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
        {/* header row */}
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
          <span>User</span>
          <span>Telegram</span>
          <span>Groups</span>
          <span>Status</span>
          <span>Last active</span>
          <span />
        </div>

        {/* rows */}
        {rows.length === 0 ? (
          <CenteredMessage>{q || filter !== "all" ? "No users match." : "No users yet."}</CenteredMessage>
        ) : (
          rows.map((u, i) => {
            const { bg, color } = getAvatarStyle(u.displayName);
            return (
              <div
                key={u.telegramUserId}
                className="jx-row"
                onClick={() => setSelected(u)}
                style={{
                  display: "grid",
                  gridTemplateColumns: COLS,
                  gap: 12,
                  padding: "13px 20px",
                  borderBottom: i < rows.length - 1 ? "1px solid rgba(255,255,255,.04)" : "none",
                  alignItems: "center",
                  cursor: "pointer",
                }}
              >
                {/* name */}
                <div style={{ display: "flex", alignItems: "center", gap: 11 }}>
                  <div
                    style={{
                      width: 36,
                      height: 36,
                      borderRadius: 10,
                      background: bg,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      fontWeight: 700,
                      fontSize: 14,
                      color,
                      flex: "none",
                    }}
                  >
                    {initials(u.displayName)}
                  </div>
                  <div>
                    <div style={{ fontSize: 14, fontWeight: 600 }}>{u.displayName}</div>
                    <div
                      style={{
                        fontSize: 11,
                        color: "rgba(244,242,251,.4)",
                        fontVariantNumeric: "tabular-nums",
                      }}
                    >
                      ID {u.telegramUserId}
                    </div>
                  </div>
                </div>

                {/* username */}
                <span style={{ fontSize: 13, color: "#A99CE3" }}>
                  {u.username ? `@${u.username}` : "—"}
                </span>

                {/* groups */}
                <span style={{ fontSize: 13, fontVariantNumeric: "tabular-nums" }}>
                  {u.groupCount}
                </span>

                {/* status */}
                <StatusPill status={u.status} />

                {/* last active */}
                <span style={{ fontSize: 13, color: "rgba(244,242,251,.55)" }}>
                  {relativeTime(u.lastActiveAt)}
                </span>

                {/* three-dot menu */}
                <svg
                  viewBox="0 0 24 24"
                  width="18"
                  height="18"
                  fill="none"
                  stroke="rgba(244,242,251,.4)"
                  strokeWidth="2"
                  strokeLinecap="round"
                  onClick={(e) => e.stopPropagation()}
                >
                  <circle cx="5" cy="12" r="1.4" />
                  <circle cx="12" cy="12" r="1.4" />
                  <circle cx="19" cy="12" r="1.4" />
                </svg>
              </div>
            );
          })
        )}
      </div>

      {/* pagination footer */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginTop: 14,
        }}
      >
        <span style={{ fontSize: 13, color: "rgba(244,242,251,.45)" }}>
          Showing {rows.length} of {users.length.toLocaleString()} users
        </span>
        <div style={{ display: "flex", gap: 6 }}>
          {["‹ Prev", "1", "2", "3", "Next ›"].map((p, i) => (
            <span
              key={p}
              style={{
                fontSize: 13,
                fontWeight: i === 1 ? 700 : 400,
                color: i === 1 ? "#fff" : "rgba(244,242,251,.6)",
                background: i === 1 ? "#6E59C7" : "transparent",
                border: i === 1 ? "none" : "1px solid rgba(255,255,255,.1)",
                padding: "7px 12px",
                borderRadius: 8,
                cursor: "pointer",
              }}
            >
              {p}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}
