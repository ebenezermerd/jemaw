import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "../lib/api.js";
import type { AdminExpensePageDto, AdminGroupDetailDto, AdminGroupDto } from "@jemaw/shared/types";
import { fmtCompact, fmtMoney, fmtNet } from "../lib/format.js";
import { CenteredMessage } from "../ui/primitives.js";

// ─── helpers ─────────────────────────────────────────────────────────────────

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

// ─── deterministic group avatar gradients ─────────────────────────────────────

const GG: Record<string, { from: string; mid?: string; to: string; text?: string; jemaw?: true }> = {
  J: { from: "#3B2C84", mid: "#6E59C7", to: "#8A78D6", jemaw: true },
  A: { from: "#1C5E4B", to: "#2DC4B0", text: "#063226" },
  R: { from: "#2A5C8E", to: "#5BA8E0" },
  H: { from: "#8a5a1a", to: "#E0B23C", text: "#2a1c04" },
  B: { from: "#1C5E4B", to: "#2DD4A7", text: "#063226" },
  C: { from: "#2A5C8E", to: "#5BA8E0" },
  D: { from: "#8a5a1a", to: "#E0B23C", text: "#2a1c04" },
  E: { from: "#1C5E4B", to: "#2DD4A7", text: "#063226" },
  F: { from: "#3B2C84", to: "#8A78D6" },
  G: { from: "#4a3a5a", to: "#8A78D6" },
  I: { from: "#3B2C84", to: "#8A78D6" },
  K: { from: "#8a5a1a", to: "#E0B23C", text: "#2a1c04" },
  L: { from: "#2A5C8E", to: "#5BA8E0" },
  M: { from: "#5a3a4a", to: "#F2685F" },
  N: { from: "#3B2C84", to: "#8A78D6" },
  O: { from: "#2A5C8E", to: "#5BA8E0" },
  P: { from: "#8a5a1a", to: "#E0B23C", text: "#2a1c04" },
  Q: { from: "#4a3a5a", to: "#8A78D6" },
  S: { from: "#2A5C8E", to: "#5BA8E0" },
  T: { from: "#3a3850", to: "#8E7BE0" },
  U: { from: "#3B2C84", to: "#8A78D6" },
  V: { from: "#1C5E4B", to: "#2DC4B0", text: "#063226" },
  W: { from: "#8a5a1a", to: "#E0B23C", text: "#2a1c04" },
  X: { from: "#4a3a5a", to: "#8A78D6" },
  Y: { from: "#1C5E4B", to: "#2DD4A7", text: "#063226" },
  Z: { from: "#5a3a4a", to: "#F2685F" },
};

function getGG(name: string) {
  return GG[name[0]?.toUpperCase() ?? "G"] ?? { from: "#3B2C84", to: "#8A78D6" };
}

// ─── GroupAvatar component ────────────────────────────────────────────────────

function GroupAvatar({ name, size }: { name: string; size: number }) {
  const g = getGG(name);
  const r = Math.round(size * 0.28);
  const inset = Math.round(size * 0.15);

  if (g.jemaw) {
    return (
      <div
        style={{
          width: size,
          height: size,
          borderRadius: r,
          background: `linear-gradient(150deg,${g.from},${g.mid ?? g.to} 65%,${g.to})`,
          position: "relative",
          overflow: "hidden",
          flex: "none",
        }}
      >
        <svg viewBox="0 0 100 100" style={{ position: "absolute", inset }}>
          <circle cx="50" cy="40" r="23" fill="#F2EFFA" opacity=".9" style={{ mixBlendMode: "screen" }} />
          <circle cx="37" cy="62" r="23" fill="#C8BFEF" opacity=".9" style={{ mixBlendMode: "screen" }} />
          <circle cx="63" cy="62" r="23" fill="#A99CE3" opacity=".9" style={{ mixBlendMode: "screen" }} />
        </svg>
      </div>
    );
  }

  return (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: r,
        background: `linear-gradient(150deg,${g.from},${g.to})`,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontWeight: 800,
        fontSize: Math.round(size * 0.38),
        color: g.text ?? "#fff",
        flex: "none",
      }}
    >
      {name[0]?.toUpperCase() ?? "G"}
    </div>
  );
}

// ─── GROUP DETAIL PAGE ────────────────────────────────────────────────────────

const MEM_COLS = "2fr 0.9fr 1.1fr 1.1fr 1.2fr 0.6fr";
const card = {
  background: "#16151F",
  border: "1px solid rgba(255,255,255,.07)",
  borderRadius: 16,
  overflow: "hidden",
} as const;
const cardHead = {
  padding: "15px 20px",
  borderBottom: "1px solid rgba(255,255,255,.07)",
  fontSize: 15,
  fontWeight: 700,
} as const;
const colHead = {
  display: "grid",
  gap: 12,
  padding: "11px 20px",
  borderBottom: "1px solid rgba(255,255,255,.07)",
  fontFamily: "var(--font-mono)",
  fontSize: 10,
  letterSpacing: ".1em",
  textTransform: "uppercase",
  color: "rgba(244,242,251,.4)",
} as const;

function Pill({ text, color, bg }: { text: string; color: string; bg: string }) {
  return (
    <span style={{ fontSize: 11, fontWeight: 700, color, background: bg, padding: "3px 9px", borderRadius: 7 }}>
      {text}
    </span>
  );
}

function MemberAvatar({ name }: { name: string }) {
  const g = getGG(name);
  return (
    <div
      style={{
        width: 34,
        height: 34,
        borderRadius: 10,
        background: g.jemaw
          ? `linear-gradient(150deg,${g.from},${g.mid ?? g.to} 65%,${g.to})`
          : `linear-gradient(140deg,${g.from},${g.to})`,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontWeight: 700,
        fontSize: 13,
        color: g.text ?? "#fff",
        flex: "none",
      }}
    >
      {name[0]?.toUpperCase() ?? "?"}
    </div>
  );
}

function GroupDetail({ groupId, onBack }: { groupId: string; onBack: () => void }) {
  const { data, isLoading, error } = useQuery({
    queryKey: ["group", groupId],
    queryFn: () => api.get<AdminGroupDetailDto>(`/api/admin/groups/${groupId}`),
  });
  const { data: recent } = useQuery({
    queryKey: ["expenses", { groupId }],
    queryFn: () => api.get<AdminExpensePageDto>(`/api/admin/expenses?groupId=${groupId}&limit=15`),
  });

  const back = (
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
      All groups
    </button>
  );

  if (isLoading) return <div>{back}<CenteredMessage>Loading group…</CenteredMessage></div>;
  if (error || !data) return <div>{back}<CenteredMessage>Could not load this group.</CenteredMessage></div>;

  const { group, members, transfers, stats } = data;
  const cur = group.defaultCurrency;
  const isJemaw = group.name.toLowerCase() === "jemaw";

  function exportData() {
    const cols = ["Name", "Username", "Role", "Status", `Paid (${cur})`, `Share (${cur})`, `Net (${cur})`, "Expenses paid"];
    const lines = [
      cols.join(","),
      ...members.map((m) =>
        [
          `"${m.displayName.replace(/"/g, '""')}"`,
          m.username ?? "",
          m.role,
          m.isActive ? "active" : "removed",
          m.paid,
          m.share,
          m.net,
          m.expenseCount,
        ].join(","),
      ),
    ];
    const blob = new Blob([lines.join("\n")], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `jemaw-group-${group.name.replace(/\s+/g, "-").toLowerCase()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div>
      {back}

      {/* header card */}
      <div style={{ ...card, padding: 22, display: "flex", alignItems: "center", gap: 18, marginBottom: 18, overflow: "visible" }}>
        <GroupAvatar name={group.name} size={64} />
        <div style={{ flex: 1 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <h2 style={{ fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 26, letterSpacing: "-.02em", margin: 0 }}>
              {group.name}
            </h2>
            {isJemaw && (
              <span style={{ fontFamily: "var(--font-brand)", fontSize: 20, color: "#8A78D6" }}>ጀማው</span>
            )}
          </div>
          <div style={{ fontSize: 13, color: "rgba(244,242,251,.45)", marginTop: 3, fontVariantNumeric: "tabular-nums" }}>
            {group.id.slice(0, 8).toUpperCase()} · {cur} · created {fmtDate(group.createdAt)}
          </div>
        </div>
        <button
          onClick={exportData}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 7,
            fontSize: 13,
            fontWeight: 700,
            color: "#fff",
            background: "#6E59C7",
            border: "none",
            padding: "9px 14px",
            borderRadius: 9,
            cursor: "pointer",
            boxShadow: "0 8px 20px -8px rgba(110,89,199,.6)",
          }}
        >
          <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 3v12" />
            <path d="M7 10l5 5 5-5" />
            <path d="M5 21h14" />
          </svg>
          Export members
        </button>
      </div>

      {/* stat strip */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 16, marginBottom: 18 }}>
        {[
          { value: fmtMoney(stats.spend, cur), label: "Total spend (loans excluded)" },
          { value: String(group.memberCount), label: "Active members" },
          { value: String(group.expenseCount), label: `Expenses · ${stats.settledExpenses} settled` },
          {
            value: String(stats.openExpenses),
            label: "Still owed on",
            accent: stats.openExpenses > 0 ? "#F0A640" : undefined,
          },
        ].map(({ value, label, accent }) => (
          <div key={label} style={{ ...card, padding: 16 }}>
            <div style={{ fontFamily: "var(--font-display)", fontWeight: 800, fontSize: 22, fontVariantNumeric: "tabular-nums", color: accent ?? "var(--text)", lineHeight: 1 }}>
              {value}
            </div>
            <div style={{ fontSize: 12, color: "rgba(244,242,251,.5)", marginTop: 6 }}>{label}</div>
          </div>
        ))}
      </div>

      {/* members & balances */}
      <div style={{ ...card, marginBottom: 18 }}>
        <div style={cardHead}>Members &amp; balances</div>
        <div style={{ ...colHead, gridTemplateColumns: MEM_COLS }}>
          <span>Member</span>
          <span>Role</span>
          <span>Paid</span>
          <span>Share</span>
          <span>Net balance</span>
          <span>Paid for</span>
        </div>
        {members.length === 0 ? (
          <CenteredMessage>No members yet.</CenteredMessage>
        ) : (
          members.map((m, i) => {
            const net = Number(m.net);
            return (
              <div
                key={m.memberId}
                className="jx-row"
                style={{
                  display: "grid",
                  gridTemplateColumns: MEM_COLS,
                  gap: 12,
                  padding: "13px 20px",
                  borderBottom: i < members.length - 1 ? "1px solid rgba(255,255,255,.04)" : "none",
                  alignItems: "center",
                  opacity: m.isActive ? 1 : 0.5,
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 11, minWidth: 0 }}>
                  <MemberAvatar name={m.displayName} />
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: 14, fontWeight: 600, display: "flex", gap: 6, alignItems: "center" }}>
                      {m.displayName}
                      {!m.isActive && <Pill text="Removed" color="#F2685F" bg="rgba(242,104,95,.12)" />}
                    </div>
                    <div style={{ fontSize: 12, color: "rgba(244,242,251,.45)" }}>
                      {m.isManual ? "added by hand" : m.username ? `@${m.username}` : `id ${m.telegramUserId}`}
                      {!m.isPrimary && m.isActive ? " · not in default splits" : ""}
                    </div>
                  </div>
                </div>
                <span>
                  {m.role === "admin" ? (
                    <Pill text="Admin" color="#A99CE3" bg="rgba(110,89,199,.16)" />
                  ) : (
                    <Pill text="Member" color="rgba(244,242,251,.55)" bg="rgba(255,255,255,.06)" />
                  )}
                </span>
                <span style={{ fontSize: 13, fontVariantNumeric: "tabular-nums" }}>{fmtMoney(m.paid, cur)}</span>
                <span style={{ fontSize: 13, fontVariantNumeric: "tabular-nums" }}>{fmtMoney(m.share, cur)}</span>
                <span
                  style={{
                    fontSize: 14,
                    fontWeight: 700,
                    fontVariantNumeric: "tabular-nums",
                    color: net > 0 ? "#2DD4A7" : net < 0 ? "#F0A640" : "rgba(244,242,251,.55)",
                  }}
                >
                  {fmtNet(m.net, cur)}
                </span>
                <span style={{ fontSize: 13, fontVariantNumeric: "tabular-nums" }}>{m.expenseCount}</span>
              </div>
            );
          })
        )}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1.4fr", gap: 18 }}>
        {/* settle plan */}
        <div style={card}>
          <div style={cardHead}>Who pays whom</div>
          {transfers.length === 0 ? (
            <CenteredMessage>Everyone is settled up.</CenteredMessage>
          ) : (
            transfers.map((t, i) => (
              <div
                key={`${t.fromMemberId}-${t.toMemberId}`}
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  padding: "12px 20px",
                  borderBottom: i < transfers.length - 1 ? "1px solid rgba(255,255,255,.04)" : "none",
                  fontSize: 13,
                }}
              >
                <span>
                  <b>{t.fromName}</b> <span style={{ color: "rgba(244,242,251,.45)" }}>→</span> <b>{t.toName}</b>
                </span>
                <span style={{ fontWeight: 700, fontVariantNumeric: "tabular-nums", color: "#F0A640" }}>
                  {fmtMoney(t.amount, cur)}
                </span>
              </div>
            ))
          )}
        </div>

        {/* recent expenses */}
        <div style={card}>
          <div style={cardHead}>
            Recent expenses
            {recent && (
              <span style={{ fontWeight: 500, fontSize: 12, color: "rgba(244,242,251,.45)" }}>
                {" "}· {recent.items.length} of {recent.total}
              </span>
            )}
          </div>
          {!recent ? (
            <CenteredMessage>Loading…</CenteredMessage>
          ) : recent.items.length === 0 ? (
            <CenteredMessage>No expenses yet.</CenteredMessage>
          ) : (
            recent.items.map((e, i) => (
              <div
                key={e.id}
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr auto",
                  gap: 10,
                  padding: "11px 20px",
                  borderBottom: i < recent.items.length - 1 ? "1px solid rgba(255,255,255,.04)" : "none",
                  fontSize: 13,
                  opacity: e.voided ? 0.45 : 1,
                }}
              >
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {e.kind === "loan" ? "Loan: " : ""}{e.description}
                  </div>
                  <div style={{ fontSize: 12, color: "rgba(244,242,251,.45)" }}>
                    {e.payerName} paid · split with {e.shares.length} · {fmtDate(e.occurredAt)}
                  </div>
                </div>
                <div style={{ textAlign: "right" }}>
                  <div style={{ fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>{fmtMoney(e.amount, e.currency)}</div>
                  <div style={{ fontSize: 11, color: e.status === "open" ? "#F0A640" : e.status === "settled" ? "#2DD4A7" : "#F2685F" }}>
                    {e.status === "open" ? "Open" : e.status === "settled" ? "Settled" : "Voided"}
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

// ─── GROUPS LIST ──────────────────────────────────────────────────────────────

export function Groups() {
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const { data: groups = [], isLoading, error } = useQuery({
    queryKey: ["groups"],
    queryFn: () => api.get<AdminGroupDto[]>("/api/admin/groups"),
  });

  if (isLoading) return <CenteredMessage>Loading groups…</CenteredMessage>;
  if (error) return <CenteredMessage>Could not load groups.</CenteredMessage>;

  if (selectedId) return <GroupDetail groupId={selectedId} onBack={() => setSelectedId(null)} />;

  const q = search.trim().toLowerCase();
  const rows = groups.filter(
    (g) => !q || g.name.toLowerCase().includes(q) || g.id.toLowerCase().includes(q),
  );

  return (
    <div>
      {/* toolbar */}
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 18 }}>
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
            placeholder="Search registered groups…"
            style={{
              flex: 1,
              background: "none",
              border: "none",
              outline: "none",
              fontSize: 14,
              color: "var(--text)",
            }}
          />
          {search && (
            <button
              onClick={() => setSearch("")}
              style={{ background: "none", border: "none", cursor: "pointer", color: "rgba(244,242,251,.4)", padding: 0 }}
            >
              <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round">
                <path d="M18 6 6 18M6 6l12 12" />
              </svg>
            </button>
          )}
        </div>

        <div style={{ flex: 1 }} />

        <span style={{ fontSize: 13, color: "rgba(244,242,251,.45)" }}>
          {groups.length.toLocaleString()} group{groups.length !== 1 ? "s" : ""}
          {rows.length < groups.length ? ` · ${rows.length} shown` : ""}
        </span>
      </div>

      {rows.length === 0 ? (
        <CenteredMessage>{q ? "No groups match." : "No groups yet."}</CenteredMessage>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(2,1fr)", gap: 16 }}>
          {rows.map((g) => {
            const isJemaw = g.name.toLowerCase() === "jemaw";

            return (
              <div
                key={g.id}
                className="jx-row"
                onClick={() => setSelectedId(g.id)}
                style={{
                  background: "#16151F",
                  border: "1px solid rgba(255,255,255,.07)",
                  borderRadius: 16,
                  padding: 18,
                  cursor: "pointer",
                }}
              >
                {/* card header */}
                <div style={{ display: "flex", alignItems: "center", gap: 13, marginBottom: 16 }}>
                  <GroupAvatar name={g.name} size={46} />

                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <span
                        style={{
                          fontSize: 17,
                          fontWeight: 700,
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {g.name}
                      </span>
                      {isJemaw && (
                        <span
                          style={{
                            fontFamily: "var(--font-brand)",
                            fontSize: 15,
                            color: "#8A78D6",
                            flex: "none",
                          }}
                        >
                          ጀማው
                        </span>
                      )}
                    </div>
                    <div
                      style={{
                        fontSize: 12,
                        color: "rgba(244,242,251,.45)",
                        fontVariantNumeric: "tabular-nums",
                        marginTop: 2,
                      }}
                    >
                      {g.id.slice(0, 8).toUpperCase()} · created {fmtDate(g.createdAt)}
                    </div>
                  </div>

                  <span style={{ fontSize: 12, color: "rgba(244,242,251,.45)", flex: "none" }}>{g.defaultCurrency}</span>
                </div>

                {/* 3-stat mini tiles */}
                <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 10 }}>
                  {[
                    { value: String(g.memberCount), label: "Members" },
                    { value: String(g.expenseCount), label: "Expenses" },
                    { value: fmtCompact(g.volume), label: `${g.defaultCurrency} spent` },
                  ].map(({ value, label }) => (
                    <div
                      key={label}
                      style={{ background: "#1E1C2A", borderRadius: 11, padding: 11 }}
                    >
                      <div
                        style={{
                          fontFamily: "var(--font-display)",
                          fontWeight: 800,
                          fontSize: 19,
                          fontVariantNumeric: "tabular-nums",
                        }}
                      >
                        {value}
                      </div>
                      <div style={{ fontSize: 11, color: "rgba(244,242,251,.45)", marginTop: 2 }}>
                        {label}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
