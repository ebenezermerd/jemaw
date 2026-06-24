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

function fmtDateShort(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function relativeTime(iso: string | null): string {
  if (!iso) return "Never";
  const diff = Date.now() - new Date(iso).getTime();
  const days = Math.floor(diff / 86400000);
  if (days === 0) return "Today";
  if (days === 1) return "Yesterday";
  if (days < 30) return `${days}d ago`;
  if (days < 365) return `${Math.floor(days / 30)}mo ago`;
  return `${Math.floor(days / 365)}y ago`;
}

function initials(name: string): string {
  return name
    .split(" ")
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("");
}

const AVATAR_COLORS = [
  ["#6E59C7", "#A99CE3"],
  ["#2DC4B0", "#5BA8E0"],
  ["#E0B23C", "#F2A94A"],
  ["#F2685F", "#F28C78"],
  ["#5BA8E0", "#8A78D6"],
];

function avatarGradient(name: string): string {
  const idx = name.charCodeAt(0) % AVATAR_COLORS.length;
  const [a, b] = AVATAR_COLORS[idx]!;
  return `linear-gradient(140deg,${a},${b})`;
}

// ─── mini components ──────────────────────────────────────────────────────────

function UserAvatar({ name, size = 36 }: { name: string; size?: number }) {
  return (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: size * 0.3,
        background: avatarGradient(name),
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontWeight: 700,
        fontSize: size * 0.38,
        color: "#fff",
        flex: "none",
        letterSpacing: "-0.02em",
      }}
    >
      {initials(name)}
    </div>
  );
}

function StatBox({ label, value, accent = "var(--text)" }: { label: string; value: string; accent?: string }) {
  return (
    <div
      style={{
        flex: 1,
        background: "var(--surface)",
        border: "1px solid var(--hairline)",
        borderRadius: 12,
        padding: "14px 16px",
      }}
    >
      <div style={{ fontSize: 20, fontWeight: 800, letterSpacing: "-.02em", fontVariantNumeric: "tabular-nums", color: accent }}>{value}</div>
      <div style={{ fontSize: 11, color: "var(--text-faint)", marginTop: 4 }}>{label}</div>
    </div>
  );
}

// ─── detail panel ─────────────────────────────────────────────────────────────

function UserDetail({
  user,
  expenses,
  onClose,
  onToggle,
  isPending,
}: {
  user: AdminUserDto;
  expenses: AdminExpenseDto[];
  onClose: () => void;
  onToggle: () => void;
  isPending: boolean;
}) {
  const userExpenses = expenses
    .filter((e) => e.payerName === user.displayName && !e.voided)
    .slice(0, 8);

  const totalPaid = userExpenses.reduce((s, e) => s + Number(e.amount), 0);

  return (
    <>
      {/* backdrop */}
      <div
        onClick={onClose}
        style={{
          position: "fixed",
          inset: 0,
          background: "rgba(0,0,0,.45)",
          zIndex: 40,
          backdropFilter: "blur(2px)",
        }}
      />

      {/* panel */}
      <div
        style={{
          position: "fixed",
          top: 0,
          right: 0,
          bottom: 0,
          width: 420,
          zIndex: 50,
          background: "var(--bg-panel)",
          borderLeft: "1px solid var(--hairline)",
          display: "flex",
          flexDirection: "column",
          overflowY: "auto",
        }}
        className="jx-scroll"
      >
        {/* header */}
        <div
          style={{
            padding: "22px 24px 20px",
            borderBottom: "1px solid var(--hairline)",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            flex: "none",
          }}
        >
          <div style={{ fontSize: 13, fontWeight: 700, color: "var(--text-dim)" }}>User profile</div>
          <button
            onClick={onClose}
            style={{
              background: "var(--surface)",
              border: "1px solid var(--hairline-2)",
              borderRadius: 8,
              color: "var(--text-dim)",
              cursor: "pointer",
              fontSize: 16,
              width: 30,
              height: 30,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              padding: 0,
            }}
          >
            ×
          </button>
        </div>

        {/* identity */}
        <div style={{ padding: "24px 24px 20px", borderBottom: "1px solid var(--hairline)" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: 20 }}>
            <UserAvatar name={user.displayName} size={56} />
            <div>
              <div style={{ fontSize: 18, fontWeight: 800, letterSpacing: "-.02em", lineHeight: 1.1 }}>
                {user.displayName}
              </div>
              {user.username && (
                <div style={{ fontSize: 13, color: "var(--accent-soft)", marginTop: 4 }}>@{user.username}</div>
              )}
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 8 }}>
                <StatusPill status={user.status} />
              </div>
            </div>
          </div>

          {/* stat row */}
          <div style={{ display: "flex", gap: 10 }}>
            <StatBox label="Groups" value={String(user.groupCount)} />
            <StatBox
              label="Total paid"
              value={totalPaid > 0 ? `${totalPaid.toLocaleString(undefined, { maximumFractionDigits: 0 })} Br` : "—"}
              accent="var(--accent-soft)"
            />
            <StatBox
              label="Last active"
              value={relativeTime(user.lastActiveAt)}
              accent={user.lastActiveAt ? "var(--text)" : "var(--text-faint)"}
            />
          </div>
        </div>

        {/* meta */}
        <div style={{ padding: "18px 24px", borderBottom: "1px solid var(--hairline)" }}>
          <div
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: 9.5,
              letterSpacing: ".14em",
              textTransform: "uppercase",
              color: "rgba(244,242,251,.3)",
              marginBottom: 12,
            }}
          >
            Details
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {[
              { label: "Telegram ID", value: user.telegramUserId },
              { label: "Username", value: user.username ? `@${user.username}` : "Not set" },
              { label: "Last activity", value: fmtDate(user.lastActiveAt) },
              { label: "Account status", value: user.isActive ? "Active" : "Suspended" },
            ].map(({ label, value }) => (
              <div key={label} style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span style={{ fontSize: 12, color: "var(--text-faint)" }}>{label}</span>
                <span
                  style={{
                    fontSize: label === "Telegram ID" ? 11 : 12,
                    fontWeight: 600,
                    color: "var(--text-dim)",
                    fontVariantNumeric: "tabular-nums",
                    fontFamily: label === "Telegram ID" ? "var(--font-mono)" : undefined,
                  }}
                >
                  {value}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* recent expenses */}
        <div style={{ padding: "18px 24px", flex: 1 }}>
          <div
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: 9.5,
              letterSpacing: ".14em",
              textTransform: "uppercase",
              color: "rgba(244,242,251,.3)",
              marginBottom: 12,
            }}
          >
            Recent expenses paid
          </div>
          {userExpenses.length === 0 ? (
            <div style={{ fontSize: 13, color: "var(--text-faint)", padding: "8px 0" }}>No expenses found.</div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column" }}>
              {userExpenses.map((e, i) => (
                <div
                  key={e.id}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 12,
                    padding: "10px 0",
                    borderBottom: i < userExpenses.length - 1 ? "1px solid rgba(255,255,255,.05)" : "none",
                  }}
                >
                  <div
                    style={{
                      width: 34,
                      height: 34,
                      borderRadius: 9,
                      background: e.kind === "loan" ? "rgba(224,178,60,.12)" : "rgba(110,89,199,.14)",
                      border: `1px solid ${e.kind === "loan" ? "rgba(224,178,60,.25)" : "rgba(110,89,199,.25)"}`,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      flex: "none",
                    }}
                  >
                    <span style={{ fontSize: 13 }}>{e.kind === "loan" ? "↗" : "₿"}</span>
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {e.description}
                    </div>
                    <div style={{ fontSize: 11, color: "var(--text-faint)", marginTop: 2 }}>{e.groupName}</div>
                  </div>
                  <div style={{ textAlign: "right", flex: "none" }}>
                    <div style={{ fontSize: 13, fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>
                      {Number(e.amount).toLocaleString(undefined, { maximumFractionDigits: 2 })} {e.currency}
                    </div>
                    <div style={{ fontSize: 11, color: "var(--text-faint)", marginTop: 2 }}>{fmtDateShort(e.occurredAt)}</div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* action footer */}
        <div
          style={{
            padding: "16px 24px",
            borderTop: "1px solid var(--hairline)",
            flex: "none",
          }}
        >
          <button
            onClick={onToggle}
            disabled={isPending}
            style={{
              width: "100%",
              padding: "12px 16px",
              borderRadius: 12,
              border: `1px solid ${user.isActive ? "rgba(242,104,95,.35)" : "rgba(45,212,167,.35)"}`,
              background: user.isActive ? "rgba(242,104,95,.1)" : "rgba(45,212,167,.1)",
              color: user.isActive ? "#F2685F" : "#2DC4B0",
              fontSize: 14,
              fontWeight: 700,
              cursor: isPending ? "default" : "pointer",
              opacity: isPending ? 0.6 : 1,
              transition: "opacity .15s",
            }}
          >
            {isPending ? "Working…" : user.isActive ? "Suspend user" : "Activate user"}
          </button>
        </div>
      </div>
    </>
  );
}

// ─── table header ─────────────────────────────────────────────────────────────

const COLS = "2.4fr 1.3fr 0.8fr 1.1fr 1.2fr 0.7fr";

function TH({ children, style }: { children?: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <div
      style={{
        fontFamily: "var(--font-mono)",
        fontSize: 9.5,
        letterSpacing: ".12em",
        textTransform: "uppercase",
        color: "var(--text-faint)",
        ...style,
      }}
    >
      {children}
    </div>
  );
}

// ─── filter tabs ──────────────────────────────────────────────────────────────

type Filter = "all" | "active" | "idle" | "new" | "suspended";
const FILTERS: { key: Filter; label: string }[] = [
  { key: "all", label: "All" },
  { key: "active", label: "Active" },
  { key: "new", label: "New" },
  { key: "idle", label: "Idle" },
  { key: "suspended", label: "Suspended" },
];

// ─── main ─────────────────────────────────────────────────────────────────────

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
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["users"] });
      // refresh the selected user from the updated list
    },
  });

  if (isLoading) return <CenteredMessage>Loading users…</CenteredMessage>;
  if (error) return <CenteredMessage>Could not load users.</CenteredMessage>;

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

  // keep detail panel in sync after mutations
  const liveSelected = selected
    ? (users.find((u) => u.telegramUserId === selected.telegramUserId) ?? selected)
    : null;

  return (
    <div style={{ position: "relative" }}>

      {/* toolbar */}
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16 }}>
        <div style={{ position: "relative", flex: "none" }}>
          <svg
            width="14"
            height="14"
            viewBox="0 0 20 20"
            fill="none"
            style={{ position: "absolute", left: 11, top: "50%", transform: "translateY(-50%)", pointerEvents: "none" }}
          >
            <circle cx="9" cy="9" r="6" stroke="rgba(244,242,251,.35)" strokeWidth="1.7" />
            <path d="M14 14l3 3" stroke="rgba(244,242,251,.35)" strokeWidth="1.7" strokeLinecap="round" />
          </svg>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name, @handle or ID…"
            style={{
              width: 280,
              background: "var(--surface)",
              border: "1px solid var(--hairline-2)",
              borderRadius: 10,
              padding: "9px 13px 9px 32px",
              fontSize: 13.5,
              color: "var(--text)",
              outline: "none",
            }}
          />
        </div>

        {/* filter tabs */}
        <div
          style={{
            display: "flex",
            gap: 2,
            background: "var(--surface)",
            border: "1px solid var(--hairline)",
            borderRadius: 10,
            padding: 3,
          }}
        >
          {FILTERS.map(({ key, label }) => (
            <button
              key={key}
              onClick={() => setFilter(key)}
              style={{
                background: filter === key ? "rgba(110,89,199,.22)" : "transparent",
                border: "none",
                borderRadius: 7,
                color: filter === key ? "var(--text)" : "var(--text-dim)",
                fontSize: 12.5,
                fontWeight: 600,
                padding: "5px 11px",
                cursor: "pointer",
                transition: "background .12s",
                whiteSpace: "nowrap",
              }}
            >
              {label}
              {counts[key] > 0 && (
                <span
                  style={{
                    marginLeft: 5,
                    fontSize: 10.5,
                    fontWeight: 700,
                    color: filter === key ? "var(--accent-soft)" : "var(--text-faint)",
                    fontVariantNumeric: "tabular-nums",
                  }}
                >
                  {counts[key]}
                </span>
              )}
            </button>
          ))}
        </div>

        <div style={{ flex: 1 }} />
        <span style={{ fontSize: 12, color: "var(--text-faint)", fontVariantNumeric: "tabular-nums" }}>
          {rows.length} {rows.length === 1 ? "user" : "users"}
        </span>
      </div>

      {/* table */}
      <div
        style={{
          background: "var(--surface)",
          border: "1px solid var(--hairline)",
          borderRadius: "var(--radius)",
          overflow: "hidden",
        }}
      >
        {/* column headers */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: COLS,
            gap: 12,
            padding: "11px 20px",
            borderBottom: "1px solid var(--hairline)",
            alignItems: "center",
          }}
        >
          <TH>User</TH>
          <TH>Telegram</TH>
          <TH>Groups</TH>
          <TH>Status</TH>
          <TH>Last active</TH>
          <TH />
        </div>

        {/* rows */}
        {rows.length === 0 ? (
          <CenteredMessage>{q || filter !== "all" ? "No users match." : "No users yet."}</CenteredMessage>
        ) : (
          rows.map((u, i) => (
            <div
              key={u.telegramUserId}
              className="jx-row"
              onClick={() => setSelected(u)}
              style={{
                display: "grid",
                gridTemplateColumns: COLS,
                gap: 12,
                padding: "12px 20px",
                borderBottom: i < rows.length - 1 ? "1px solid rgba(255,255,255,.04)" : "none",
                alignItems: "center",
                cursor: "pointer",
                background: liveSelected?.telegramUserId === u.telegramUserId
                  ? "rgba(110,89,199,.1)"
                  : undefined,
              }}
            >
              {/* name + avatar */}
              <div style={{ display: "flex", alignItems: "center", gap: 11, minWidth: 0 }}>
                <UserAvatar name={u.displayName} size={34} />
                <div style={{ minWidth: 0 }}>
                  <div
                    style={{
                      fontSize: 13.5,
                      fontWeight: 600,
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {u.displayName}
                  </div>
                  <div
                    style={{
                      fontSize: 10.5,
                      color: "var(--text-faint)",
                      fontFamily: "var(--font-mono)",
                      marginTop: 1,
                    }}
                  >
                    {u.telegramUserId}
                  </div>
                </div>
              </div>

              {/* username */}
              <span
                style={{
                  fontSize: 13,
                  color: u.username ? "var(--accent-soft)" : "var(--text-faint)",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
              >
                {u.username ? `@${u.username}` : "—"}
              </span>

              {/* groups */}
              <span style={{ fontSize: 13, fontVariantNumeric: "tabular-nums" }}>{u.groupCount}</span>

              {/* status */}
              <StatusPill status={u.status} />

              {/* last active */}
              <span style={{ fontSize: 12.5, color: "var(--text-dim)" }}>
                {relativeTime(u.lastActiveAt)}
              </span>

              {/* quick action — stop propagation so it doesn't open the panel */}
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  toggle.mutate(u);
                }}
                disabled={toggle.isPending}
                style={{
                  background: "transparent",
                  border: "1px solid var(--hairline-2)",
                  borderRadius: 8,
                  color: u.isActive ? "var(--danger)" : "var(--success)",
                  fontSize: 11.5,
                  fontWeight: 700,
                  padding: "5px 10px",
                  cursor: toggle.isPending ? "default" : "pointer",
                  whiteSpace: "nowrap",
                }}
              >
                {u.isActive ? "Suspend" : "Activate"}
              </button>
            </div>
          ))
        )}
      </div>

      {/* detail panel */}
      {liveSelected && (
        <UserDetail
          user={liveSelected}
          expenses={expenses}
          onClose={() => setSelected(null)}
          onToggle={() => toggle.mutate(liveSelected)}
          isPending={toggle.isPending}
        />
      )}
    </div>
  );
}
