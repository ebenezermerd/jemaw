import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "../lib/api.js";
import type { AdminGroupDto, AdminExpenseDto } from "@jemaw/shared/types";
import { CenteredMessage } from "../ui/primitives.js";

// ─── helpers ─────────────────────────────────────────────────────────────────

function fmtVolume(decStr: string): string {
  const n = Number(decStr);
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1).replace(/\.0$/, "")}M`;
  if (n >= 1_000) return `${(n / 1000).toFixed(0)}k`;
  return n.toLocaleString(undefined, { maximumFractionDigits: 0 });
}

function fmtFull(decStr: string): string {
  return Number(decStr).toLocaleString(undefined, { maximumFractionDigits: 0 });
}

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

const MEM_COLS = "2fr 1fr 1.2fr 1.2fr 0.8fr";

function GroupDetail({
  group,
  expenses,
  onBack,
}: {
  group: AdminGroupDto;
  expenses: AdminExpenseDto[];
  onBack: () => void;
}) {
  const groupExpenses = expenses.filter((e) => e.groupName === group.name && !e.voided);

  // Build member stats from expense data
  const memberMap = new Map<string, { name: string; paid: number; entries: number }>();
  groupExpenses.forEach((e) => {
    const m = memberMap.get(e.payerName) ?? { name: e.payerName, paid: 0, entries: 0 };
    m.paid += Number(e.amount);
    m.entries++;
    memberMap.set(e.payerName, m);
  });

  const totalSpend = groupExpenses.reduce((s, e) => s + Number(e.amount), 0);
  const memberCount = memberMap.size || group.memberCount;
  const equalShare = memberCount > 0 ? totalSpend / memberCount : 0;

  const members = [...memberMap.values()]
    .map((m) => ({ ...m, net: m.paid - equalShare }))
    .sort((a, b) => b.net - a.net);

  const unsettledCount = groupExpenses.filter((e) => e.kind === "loan").length;
  const isJemaw = group.name.toLowerCase() === "jemaw";

  function exportData() {
    const cols = ["Name", "Paid (Br)", "Net Balance (Br)", "Entries"];
    const lines = [
      cols.join(","),
      ...members.map((m) =>
        [`"${m.name}"`, m.paid.toFixed(0), m.net.toFixed(0), m.entries].join(","),
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
        All groups
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
        <GroupAvatar name={group.name} size={64} />

        <div style={{ flex: 1 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <h2
              style={{
                fontFamily: "var(--font-display)",
                fontWeight: 700,
                fontSize: 26,
                letterSpacing: "-.02em",
                margin: 0,
              }}
            >
              {group.name}
            </h2>
            {isJemaw && (
              <span style={{ fontFamily: "var(--font-brand)", fontSize: 20, color: "#8A78D6" }}>
                ጀማው
              </span>
            )}
            <span
              style={{
                fontSize: 11,
                fontWeight: 700,
                color: "#2DD4A7",
                background: "rgba(45,212,167,.12)",
                padding: "3px 10px",
                borderRadius: 7,
              }}
            >
              Active
            </span>
          </div>
          <div
            style={{
              fontSize: 13,
              color: "rgba(244,242,251,.45)",
              marginTop: 3,
              fontVariantNumeric: "tabular-nums",
            }}
          >
            {group.id.slice(0, 8).toUpperCase()} · {group.defaultCurrency} · created {fmtDate(group.createdAt)}
          </div>
        </div>

        <div style={{ display: "flex", gap: 9 }}>
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
            Export group data
          </button>
          <button
            style={{
              fontSize: 13,
              fontWeight: 600,
              color: "rgba(244,242,251,.7)",
              border: "1px solid rgba(255,255,255,.12)",
              background: "transparent",
              padding: "9px 14px",
              borderRadius: 9,
              cursor: "pointer",
            }}
          >
            Message admin
          </button>
          <button
            style={{
              fontSize: 13,
              fontWeight: 700,
              color: "#F2685F",
              border: "1px solid rgba(242,104,95,.3)",
              background: "transparent",
              padding: "9px 14px",
              borderRadius: 9,
              cursor: "pointer",
            }}
          >
            Suspend group
          </button>
        </div>
      </div>

      {/* 4-stat strip */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(4,1fr)",
          gap: 16,
          marginBottom: 18,
        }}
      >
        {[
          { value: fmtFull(group.volume), suffix: " Br", label: "Total spend" },
          { value: String(group.memberCount), label: "Members" },
          { value: String(groupExpenses.length), label: "Expenses" },
          {
            value: String(unsettledCount),
            label: "Unsettled",
            accent: unsettledCount > 0 ? "#F0A640" : undefined,
          },
        ].map(({ value, suffix, label, accent }) => (
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
              {suffix && <span style={{ fontSize: 14, opacity: 0.6 }}>{suffix}</span>}
            </div>
            <div style={{ fontSize: 12, color: "rgba(244,242,251,.5)", marginTop: 6 }}>{label}</div>
          </div>
        ))}
      </div>

      {/* members & balances table */}
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
          Members &amp; balances
        </div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: MEM_COLS,
            gap: 12,
            padding: "11px 20px",
            borderBottom: "1px solid rgba(255,255,255,.07)",
            fontFamily: "var(--font-mono)",
            fontSize: 10,
            letterSpacing: ".1em",
            textTransform: "uppercase",
            color: "rgba(244,242,251,.4)",
          }}
        >
          <span>Member</span>
          <span>Role</span>
          <span>Paid</span>
          <span>Net balance</span>
          <span>Entries</span>
        </div>

        {members.length === 0 ? (
          <CenteredMessage>No expense data for this group yet.</CenteredMessage>
        ) : (
          members.map((m, i) => {
            const isAdmin = i === 0;
            const g = getGG(m.name);
            const letter = m.name[0]?.toUpperCase() ?? "?";
            return (
              <div
                key={m.name}
                className="jx-row"
                style={{
                  display: "grid",
                  gridTemplateColumns: MEM_COLS,
                  gap: 12,
                  padding: "13px 20px",
                  borderBottom: i < members.length - 1 ? "1px solid rgba(255,255,255,.04)" : "none",
                  alignItems: "center",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 11 }}>
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
                    {letter}
                  </div>
                  <span style={{ fontSize: 14, fontWeight: 600 }}>{m.name}</span>
                </div>

                <span>
                  {isAdmin ? (
                    <span
                      style={{
                        fontSize: 11,
                        fontWeight: 700,
                        color: "#A99CE3",
                        background: "rgba(110,89,199,.16)",
                        padding: "3px 9px",
                        borderRadius: 7,
                      }}
                    >
                      Admin
                    </span>
                  ) : (
                    <span
                      style={{
                        fontSize: 11,
                        fontWeight: 600,
                        color: "rgba(244,242,251,.55)",
                        background: "rgba(255,255,255,.06)",
                        padding: "3px 9px",
                        borderRadius: 7,
                      }}
                    >
                      Member
                    </span>
                  )}
                </span>

                <span style={{ fontSize: 13, fontVariantNumeric: "tabular-nums" }}>
                  {m.paid.toLocaleString(undefined, { maximumFractionDigits: 0 })} Br
                </span>

                <span
                  style={{
                    fontSize: 14,
                    fontWeight: 700,
                    fontVariantNumeric: "tabular-nums",
                    color: m.net >= 0 ? "#2DD4A7" : "#F0A640",
                  }}
                >
                  {m.net >= 0 ? "+" : "−"}
                  {Math.abs(m.net).toLocaleString(undefined, { maximumFractionDigits: 0 })} Br
                </span>

                <span style={{ fontSize: 13, fontVariantNumeric: "tabular-nums" }}>{m.entries}</span>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

// ─── GROUPS LIST ──────────────────────────────────────────────────────────────

export function Groups() {
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<AdminGroupDto | null>(null);

  const { data: groups = [], isLoading, error } = useQuery({
    queryKey: ["groups"],
    queryFn: () => api.get<AdminGroupDto[]>("/api/admin/groups"),
  });

  const { data: expenses = [] } = useQuery({
    queryKey: ["expenses"],
    queryFn: () => api.get<AdminExpenseDto[]>("/api/admin/expenses"),
  });

  if (isLoading) return <CenteredMessage>Loading groups…</CenteredMessage>;
  if (error) return <CenteredMessage>Could not load groups.</CenteredMessage>;

  const liveSelected = selected ? (groups.find((g) => g.id === selected.id) ?? selected) : null;

  if (liveSelected) {
    return (
      <GroupDetail group={liveSelected} expenses={expenses} onBack={() => setSelected(null)} />
    );
  }

  const q = search.trim().toLowerCase();
  const rows = groups.filter(
    (g) => !q || g.name.toLowerCase().includes(q) || g.id.toLowerCase().includes(q),
  );

  // derive entry counts per group name from expense data
  const entriesByGroup = new Map<string, number>();
  expenses.forEach((e) => {
    entriesByGroup.set(e.groupName, (entriesByGroup.get(e.groupName) ?? 0) + 1);
  });

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
            const entries = entriesByGroup.get(g.name) ?? 0;
            const isJemaw = g.name.toLowerCase() === "jemaw";

            return (
              <div
                key={g.id}
                className="jx-row"
                onClick={() => setSelected(g)}
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

                  <span
                    style={{
                      fontSize: 11,
                      fontWeight: 700,
                      color: "#2DD4A7",
                      background: "rgba(45,212,167,.12)",
                      padding: "3px 10px",
                      borderRadius: 7,
                      flex: "none",
                    }}
                  >
                    Active
                  </span>
                </div>

                {/* 3-stat mini tiles */}
                <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 10 }}>
                  {[
                    { value: String(g.memberCount), label: "Members" },
                    { value: String(entries), label: "Entries" },
                    { value: fmtVolume(g.volume), label: "Br spend" },
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
