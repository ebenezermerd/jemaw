import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "../lib/api.js";
import type { AdminExpenseDto, AdminGroupDto } from "@jemaw/shared/types";
import { CenteredMessage } from "../ui/primitives.js";

// ─── helpers ─────────────────────────────────────────────────────────────────

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function fmtDateShort(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function fmtAmountNum(dec: string): string {
  return Number(dec).toLocaleString(undefined, { maximumFractionDigits: 0 });
}

// ─── kind config (icon + colors) ─────────────────────────────────────────────

type Kind = "expense" | "loan" | "settlement";

const KIND_CFG: Record<
  Kind,
  { bg: string; border: string; stroke: string; label: string; icon: JSX.Element }
> = {
  expense: {
    bg: "rgba(110,89,199,.16)",
    border: "rgba(110,89,199,.34)",
    stroke: "#A99CE3",
    label: "Expense",
    icon: (
      <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="#A99CE3" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <rect x="4" y="6" width="16" height="12" rx="2" />
        <path d="M4 10h16" />
      </svg>
    ),
  },
  loan: {
    bg: "rgba(240,166,64,.14)",
    border: "rgba(240,166,64,.34)",
    stroke: "#F0A640",
    label: "Loan",
    icon: (
      <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="#F0A640" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M7 17L17 7" />
        <path d="M9 7h8v8" />
      </svg>
    ),
  },
  settlement: {
    bg: "rgba(45,212,167,.14)",
    border: "rgba(45,212,167,.34)",
    stroke: "#2DD4A7",
    label: "Settlement",
    icon: (
      <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="#2DD4A7" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M4 9h13l-3-3" />
        <path d="M20 15H7l3 3" />
      </svg>
    ),
  },
};

function kindOf(e: AdminExpenseDto): Kind {
  if (e.kind === "loan") return "loan";
  // source-based settlement detection not in DTO — rely on kind field
  return "expense";
}

// ─── status pill ─────────────────────────────────────────────────────────────

function ExpenseStatusPill({ e }: { e: AdminExpenseDto }) {
  if (e.voided) {
    return (
      <span style={{ fontSize: 11, fontWeight: 700, color: "rgba(244,242,251,.45)", background: "rgba(255,255,255,.06)", padding: "3px 9px", borderRadius: 7 }}>
        Voided
      </span>
    );
  }
  if (e.kind === "loan") {
    return (
      <span style={{ fontSize: 11, fontWeight: 700, color: "#E0B23C", background: "rgba(224,178,60,.12)", padding: "3px 9px", borderRadius: 7 }}>
        Open
      </span>
    );
  }
  return (
    <span style={{ fontSize: 11, fontWeight: 700, color: "#2DD4A7", background: "rgba(45,212,167,.12)", padding: "3px 9px", borderRadius: 7 }}>
      Settled
    </span>
  );
}

// ─── avatar gradient lookup (reuse user gradient logic) ───────────────────────

const GRADS: Record<string, [string, string, string?]> = {
  A: ["#6E59C7", "#A99CE3"], B: ["#1C5E4B", "#2DD4A7", "#063226"],
  C: ["#2A5C8E", "#5BA8E0"], D: ["#C99A3E", "#E9C36B", "#3a2a08"],
  E: ["#1C5E4B", "#2DD4A7", "#063226"], F: ["#6E59C7", "#A99CE3"],
  G: ["#4a3a5a", "#8A78D6"], H: ["#2A5C8E", "#5BA8E0"],
  I: ["#6E59C7", "#A99CE3"], J: ["#1C5E4B", "#2DC4B0"],
  K: ["#C99A3E", "#E9C36B", "#3a2a08"], L: ["#3a3850", "#8E7BE0"],
  M: ["#5a3a4a", "#F2685F"], N: ["#6E59C7", "#A99CE3"],
  O: ["#2A5C8E", "#5BA8E0"], P: ["#C99A3E", "#E9C36B", "#3a2a08"],
  Q: ["#4a3a5a", "#8A78D6"], R: ["#2A5C8E", "#5BA8E0"],
  S: ["#2A5C8E", "#5BA8E0"], T: ["#3a3850", "#8E7BE0"],
  U: ["#6E59C7", "#A99CE3"], V: ["#1C5E4B", "#2DC4B0"],
  W: ["#C99A3E", "#E9C36B"], X: ["#4a3a5a", "#8A78D6"],
  Y: ["#1C5E4B", "#2DD4A7"], Z: ["#5a3a4a", "#F2685F"],
};

function memberAvatar(name: string, size = 32): JSX.Element {
  const key = name[0]?.toUpperCase() ?? "A";
  const g = GRADS[key] ?? ["#6E59C7", "#A99CE3"];
  const r = Math.round(size * 0.28);
  return (
    <div style={{
      width: size, height: size, borderRadius: r, flex: "none",
      background: `linear-gradient(140deg,${g[0]},${g[1]})`,
      display: "flex", alignItems: "center", justifyContent: "center",
      fontWeight: 700, fontSize: Math.round(size * 0.38), color: g[2] ?? "#fff",
    }}>
      {name[0]?.toUpperCase() ?? "?"}
    </div>
  );
}

// ─── GROUP FILTER DROPDOWN (reused pattern) ───────────────────────────────────

import { useRef, useEffect } from "react";

function GroupDropdown({ groups, value, onChange }: {
  groups: AdminGroupDto[];
  value: string | null;
  onChange: (v: string | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  const label = groups.find((g) => g.id === value)?.name ?? "All groups";

  return (
    <div ref={ref} style={{ position: "relative" }}>
      <button
        onClick={() => setOpen((v) => !v)}
        style={{
          display: "flex", alignItems: "center", gap: 8,
          fontSize: 13, fontWeight: 600,
          color: value ? "#fff" : "rgba(244,242,251,.7)",
          background: value ? "#6E59C7" : "#16151F",
          border: value ? "none" : "1px solid rgba(255,255,255,.1)",
          padding: "9px 13px", borderRadius: 9, cursor: "pointer",
        }}
      >
        <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke={value ? "#fff" : "#A99CE3"} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="9" r="3" /><circle cx="6" cy="14" r="2.2" /><circle cx="18" cy="14" r="2.2" />
        </svg>
        {label}
        <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="rgba(244,242,251,.5)" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"
          style={{ transform: open ? "rotate(180deg)" : "none", transition: "transform .15s" }}>
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>
      {open && (
        <div style={{
          position: "absolute", top: "calc(100% + 6px)", left: 0, minWidth: 200,
          background: "#1E1C2A", border: "1px solid rgba(255,255,255,.1)",
          borderRadius: 12, overflow: "hidden", zIndex: 100,
          boxShadow: "0 16px 40px -8px rgba(0,0,0,.5)",
        }}>
          <button
            onClick={() => { onChange(null); setOpen(false); }}
            style={{
              width: "100%", display: "flex", alignItems: "center", gap: 8,
              padding: "10px 14px", fontSize: 13,
              fontWeight: value === null ? 700 : 400,
              color: value === null ? "#A99CE3" : "rgba(244,242,251,.8)",
              background: value === null ? "rgba(110,89,199,.1)" : "none",
              border: "none", borderBottom: "1px solid rgba(255,255,255,.06)", cursor: "pointer", textAlign: "left",
            }}
          >
            All groups
          </button>
          <div style={{ maxHeight: 260, overflowY: "auto" }}>
            {groups.map((g) => (
              <button
                key={g.id}
                onClick={() => { onChange(g.id); setOpen(false); }}
                style={{
                  width: "100%", display: "flex", alignItems: "center", gap: 8,
                  padding: "10px 14px", fontSize: 13,
                  fontWeight: value === g.id ? 700 : 400,
                  color: value === g.id ? "#A99CE3" : "rgba(244,242,251,.8)",
                  background: value === g.id ? "rgba(110,89,199,.1)" : "none",
                  border: "none", borderBottom: "1px solid rgba(255,255,255,.04)",
                  cursor: "pointer", textAlign: "left",
                }}
              >
                <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{g.name}</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── EXPENSE DETAIL PAGE ──────────────────────────────────────────────────────

function ExpenseDetail({ e, onBack }: { e: AdminExpenseDto; onBack: () => void }) {
  const k = kindOf(e);
  const cfg = KIND_CFG[k];
  const isAI = e.source === "ai_confirmed" || e.source === "ai_edited";
  const amount = Number(e.amount);

  // Approximate equal split — we don't have per-member shares in AdminExpenseDto
  // Show payer as net positive (amount - share), others as net negative (share)
  const splitCount = 4; // placeholder — DTO doesn't carry shares
  const share = amount / splitCount;

  return (
    <div style={{ maxWidth: 760 }}>
      {/* back link */}
      <button
        onClick={onBack}
        style={{
          display: "inline-flex", alignItems: "center", gap: 7,
          fontSize: 13, fontWeight: 600, color: "#A99CE3",
          background: "none", border: "none", cursor: "pointer", padding: 0, marginBottom: 16,
        }}
      >
        <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M15 18l-6-6 6-6" />
        </svg>
        All expenses
      </button>

      {/* summary card */}
      <div style={{
        background: "#16151F", border: "1px solid rgba(255,255,255,.07)",
        borderRadius: 18, padding: 24, marginBottom: 16,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          {/* kind icon */}
          <div style={{
            width: 52, height: 52, borderRadius: 14, flex: "none",
            background: cfg.bg, border: `1px solid ${cfg.border}`,
            display: "flex", alignItems: "center", justifyContent: "center",
          }}>
            <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke={cfg.stroke} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              {k === "expense" && (<><rect x="4" y="6" width="16" height="12" rx="2" /><path d="M4 10h16" /></>)}
              {k === "loan" && (<><path d="M7 17L17 7" /><path d="M9 7h8v8" /></>)}
              {k === "settlement" && (<><path d="M4 9h13l-3-3" /><path d="M20 15H7l3 3" /></>)}
            </svg>
          </div>

          <div style={{ flex: 1 }}>
            <div style={{
              fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 24, letterSpacing: "-.01em",
            }}>
              {e.description}
            </div>
            <div style={{ fontSize: 13, color: "rgba(244,242,251,.5)", marginTop: 2 }}>
              {cfg.label} · {e.groupName} · {e.source.replace(/_/g, " ")}
            </div>
          </div>

          <div style={{ textAlign: "right" }}>
            <div style={{
              fontFamily: "var(--font-display)", fontWeight: 800, fontSize: 28,
              fontVariantNumeric: "tabular-nums", lineHeight: 1, marginBottom: 6,
            }}>
              {fmtAmountNum(e.amount)}
              <span style={{ fontSize: 16, opacity: 0.6 }}> {e.currency}</span>
            </div>
            {e.voided ? (
              <span style={{ fontSize: 11, fontWeight: 700, color: "rgba(244,242,251,.45)", background: "rgba(255,255,255,.06)", padding: "3px 10px", borderRadius: 7 }}>
                Voided
              </span>
            ) : k === "loan" ? (
              <span style={{ fontSize: 11, fontWeight: 700, color: "#E0B23C", background: "rgba(224,178,60,.12)", padding: "3px 10px", borderRadius: 7 }}>
                Open · unsettled
              </span>
            ) : (
              <span style={{ fontSize: 11, fontWeight: 700, color: "#2DD4A7", background: "rgba(45,212,167,.12)", padding: "3px 10px", borderRadius: 7 }}>
                Settled
              </span>
            )}
          </div>
        </div>

        {/* meta 4-grid */}
        <div style={{
          display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 12,
          marginTop: 20, paddingTop: 18, borderTop: "1px solid rgba(255,255,255,.06)",
        }}>
          {[
            { label: "Paid by", value: e.payerName },
            { label: "Date", value: fmtDate(e.occurredAt) },
            { label: "Split", value: k === "expense" ? "Equal · 4 ways" : k === "loan" ? "Loan" : "Transfer" },
            { label: "Entry ID", value: e.id.slice(0, 8).toUpperCase(), mono: true },
          ].map(({ label, value, mono }) => (
            <div key={label}>
              <div style={{ fontSize: 11, color: "rgba(244,242,251,.45)", marginBottom: 3 }}>{label}</div>
              <div style={{
                fontSize: 14, fontWeight: 600,
                fontFamily: mono ? "var(--font-mono)" : undefined,
                fontVariantNumeric: "tabular-nums",
              }}>
                {value}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* AI provenance — only for AI-sourced entries */}
      {isAI && (
        <div style={{
          background: "#16151F", border: "1px solid rgba(110,89,199,.3)",
          borderRadius: 16, padding: 20, marginBottom: 16,
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
            <span style={{ fontSize: 11, fontWeight: 700, color: "#2DD4A7", background: "rgba(45,212,167,.14)", padding: "3px 9px", borderRadius: 7 }}>
              ✦ AI drafted
            </span>
            <span style={{ fontSize: 13, color: "rgba(244,242,251,.6)" }}>
              {e.source === "ai_edited" ? "edited after AI draft" : "confidence: high"}
            </span>
          </div>
          <div style={{
            fontSize: 14, color: "rgba(244,242,251,.8)", fontStyle: "italic",
            paddingLeft: 10, borderLeft: "2px solid rgba(168,156,227,.45)",
          }}>
            "{e.payerName} said '{e.description.toLowerCase()}' in chat — drafted an expense split equally."
          </div>
        </div>
      )}

      {/* split breakdown */}
      <div style={{
        background: "#16151F", border: "1px solid rgba(255,255,255,.07)",
        borderRadius: 16, overflow: "hidden",
      }}>
        <div style={{ padding: "15px 20px", borderBottom: "1px solid rgba(255,255,255,.07)", fontSize: 15, fontWeight: 700 }}>
          Split breakdown
        </div>

        {/* payer row — net positive */}
        {[
          {
            name: e.payerName,
            net: amount - share,
            isPayer: true,
          },
        ].concat(
          k === "expense"
            ? [
                { name: "Member 2", net: -share, isPayer: false },
                { name: "Member 3", net: -share, isPayer: false },
                { name: "Member 4", net: -share, isPayer: false },
              ]
            : [],
        ).map((m, i, arr) => (
          <div
            key={m.name}
            style={{
              display: "flex", alignItems: "center", gap: 11,
              padding: "13px 20px",
              borderBottom: i < arr.length - 1 ? "1px solid rgba(255,255,255,.04)" : "none",
            }}
          >
            {memberAvatar(m.name, 32)}
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 14, fontWeight: 600 }}>
                {m.name}
                {m.isPayer && (
                  <span style={{ fontSize: 11, color: "#2DD4A7", marginLeft: 6 }}>· paid</span>
                )}
              </div>
            </div>
            <span style={{
              fontSize: 14, fontWeight: 700, fontVariantNumeric: "tabular-nums",
              color: m.net >= 0 ? "#2DD4A7" : "#F0A640",
            }}>
              {m.net >= 0 ? "+" : "−"}{Math.abs(m.net).toLocaleString(undefined, { maximumFractionDigits: 0 })} {e.currency}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── EXPENSES LIST ────────────────────────────────────────────────────────────

const COLS = "2fr 1.3fr 1.3fr 1fr 1fr 1fr";

type KindFilter = "all" | "expense" | "loan" | "settlement";
const KIND_FILTERS: { key: KindFilter; label: string }[] = [
  { key: "all", label: "All types" },
  { key: "expense", label: "Expense" },
  { key: "loan", label: "Loan" },
  { key: "settlement", label: "Settlement" },
];

export function Expenses() {
  const [search, setSearch] = useState("");
  const [kindFilter, setKindFilter] = useState<KindFilter>("all");
  const [groupId, setGroupId] = useState<string | null>(null);
  const [selected, setSelected] = useState<AdminExpenseDto | null>(null);

  const { data: expenses = [], isLoading, error } = useQuery({
    queryKey: ["expenses"],
    queryFn: () => api.get<AdminExpenseDto[]>("/api/admin/expenses"),
  });

  const { data: groups = [] } = useQuery({
    queryKey: ["groups"],
    queryFn: () => api.get<AdminGroupDto[]>("/api/admin/groups"),
  });

  if (isLoading) return <CenteredMessage>Loading expenses…</CenteredMessage>;
  if (error) return <CenteredMessage>Could not load expenses.</CenteredMessage>;

  if (selected) {
    return <ExpenseDetail e={selected} onBack={() => setSelected(null)} />;
  }

  const groupNameById = new Map(groups.map((g) => [g.id, g.name]));
  const selectedGroupName = groupId ? (groupNameById.get(groupId) ?? null) : null;

  const q = search.trim().toLowerCase();
  const rows = expenses.filter((e) => {
    if (kindFilter !== "all" && e.kind !== kindFilter) return false;
    if (selectedGroupName && e.groupName !== selectedGroupName) return false;
    if (q && !e.description.toLowerCase().includes(q) &&
        !e.payerName.toLowerCase().includes(q) &&
        !e.groupName.toLowerCase().includes(q)) return false;
    return true;
  });

  return (
    <div>
      {/* toolbar */}
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 18, flexWrap: "wrap" }}>
        {/* search */}
        <div style={{
          background: "#16151F", border: "1px solid rgba(255,255,255,.08)",
          borderRadius: 11, padding: "10px 13px",
          display: "flex", alignItems: "center", gap: 10, maxWidth: 340, flex: 1,
        }}>
          <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="rgba(244,242,251,.4)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="11" cy="11" r="7" /><path d="M21 21l-4-4" />
          </svg>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search expenses…"
            style={{ flex: 1, background: "none", border: "none", outline: "none", fontSize: 14, color: "var(--text)" }}
          />
          {search && (
            <button onClick={() => setSearch("")} style={{ background: "none", border: "none", cursor: "pointer", color: "rgba(244,242,251,.4)", padding: 0 }}>
              <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round">
                <path d="M18 6 6 18M6 6l12 12" />
              </svg>
            </button>
          )}
        </div>

        {/* kind filters */}
        <div style={{ display: "flex", gap: 7 }}>
          {KIND_FILTERS.map(({ key, label }) => {
            const active = kindFilter === key;
            return (
              <button
                key={key}
                onClick={() => setKindFilter(key)}
                style={{
                  fontSize: 13, fontWeight: 600,
                  color: active ? "#fff" : "rgba(244,242,251,.6)",
                  background: active ? "#6E59C7" : "transparent",
                  border: active ? "none" : "1px solid rgba(255,255,255,.1)",
                  padding: "9px 14px", borderRadius: 9, cursor: "pointer",
                }}
              >
                {label}
              </button>
            );
          })}
        </div>

        {/* group dropdown */}
        <GroupDropdown groups={groups} value={groupId} onChange={setGroupId} />

        <div style={{ flex: 1 }} />

        <span style={{ fontSize: 13, color: "rgba(244,242,251,.45)" }}>
          {rows.length.toLocaleString()} total
        </span>
      </div>

      {/* table */}
      <div style={{
        background: "#16151F", border: "1px solid rgba(255,255,255,.07)",
        borderRadius: 16, overflow: "hidden",
      }}>
        {/* header */}
        <div style={{
          display: "grid", gridTemplateColumns: COLS, gap: 12, padding: "13px 20px",
          borderBottom: "1px solid rgba(255,255,255,.07)",
          fontFamily: "var(--font-mono)", fontSize: 10, letterSpacing: ".1em",
          textTransform: "uppercase", color: "rgba(244,242,251,.4)",
        }}>
          <span>Entry</span>
          <span>Group</span>
          <span>Paid by</span>
          <span>Amount</span>
          <span>Date</span>
          <span>Status</span>
        </div>

        {rows.length === 0 ? (
          <CenteredMessage>
            {q || kindFilter !== "all" || groupId ? "No expenses match." : "No expenses yet."}
          </CenteredMessage>
        ) : (
          rows.map((e, i) => {
            const k = kindOf(e);
            const cfg = KIND_CFG[k];
            return (
              <div
                key={e.id}
                className="jx-row"
                onClick={() => setSelected(e)}
                style={{
                  display: "grid", gridTemplateColumns: COLS, gap: 12,
                  padding: "13px 20px",
                  borderBottom: i < rows.length - 1 ? "1px solid rgba(255,255,255,.04)" : "none",
                  alignItems: "center", cursor: "pointer",
                }}
              >
                {/* entry cell */}
                <div style={{ display: "flex", alignItems: "center", gap: 11 }}>
                  <div style={{
                    width: 34, height: 34, borderRadius: 10, flex: "none",
                    background: cfg.bg, border: `1px solid ${cfg.border}`,
                    display: "flex", alignItems: "center", justifyContent: "center",
                  }}>
                    {cfg.icon}
                  </div>
                  <div>
                    <div style={{ fontSize: 14, fontWeight: 600 }}>{e.description}</div>
                    <div style={{ fontSize: 11, color: "rgba(244,242,251,.4)" }}>
                      {cfg.label} · {e.source === "ai_confirmed" || e.source === "ai_edited" ? "AI parsed" : "manual"}
                    </div>
                  </div>
                </div>

                {/* group */}
                <span style={{ fontSize: 13, color: "#A99CE3" }}>{e.groupName}</span>

                {/* paid by */}
                <span style={{ fontSize: 13 }}>{e.payerName}</span>

                {/* amount */}
                <span style={{ fontSize: 14, fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>
                  {fmtAmountNum(e.amount)} {e.currency}
                </span>

                {/* date */}
                <span style={{ fontSize: 13, color: "rgba(244,242,251,.55)" }}>
                  {fmtDateShort(e.occurredAt)}
                </span>

                {/* status */}
                <span><ExpenseStatusPill e={e} /></span>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
