import { useQuery } from "@tanstack/react-query";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  PieChart,
  Pie,
  Cell,
} from "recharts";
import { api } from "../lib/api.js";
import type { AdminOverviewDto } from "@jemaw/shared/types";
import { Card, CenteredMessage } from "../ui/primitives.js";

// ─── helpers ─────────────────────────────────────────────────────────────────

function fmt(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1).replace(/\.0$/, "")}M`;
  if (n >= 10_000) return `${(n / 1000).toFixed(0)}k`;
  return n.toLocaleString();
}

function fmtDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

// ─── KPI icons ───────────────────────────────────────────────────────────────

function IconUsers({ color }: { color: string }) {
  return (
    <svg width="18" height="18" viewBox="0 0 20 20" fill="none">
      <circle cx="8" cy="6" r="3" stroke={color} strokeWidth="1.8" />
      <path d="M2 17c0-3.314 2.686-6 6-6h0c3.314 0 6 2.686 6 6" stroke={color} strokeWidth="1.8" strokeLinecap="round" />
      <path d="M14 9a3 3 0 0 1 0-6M18 17c0-2.761-1.79-5.11-4.25-5.83" stroke={color} strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

function IconGroups({ color }: { color: string }) {
  return (
    <svg width="18" height="18" viewBox="0 0 20 20" fill="none">
      <rect x="2" y="5" width="7" height="7" rx="2" stroke={color} strokeWidth="1.8" />
      <rect x="11" y="5" width="7" height="7" rx="2" stroke={color} strokeWidth="1.8" />
      <rect x="5.5" y="12" width="9" height="5" rx="2" stroke={color} strokeWidth="1.8" />
    </svg>
  );
}

function IconExpenses({ color }: { color: string }) {
  return (
    <svg width="18" height="18" viewBox="0 0 20 20" fill="none">
      <rect x="3" y="4" width="14" height="12" rx="2" stroke={color} strokeWidth="1.8" />
      <path d="M3 8h14" stroke={color} strokeWidth="1.8" />
      <path d="M8 12h4" stroke={color} strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

function IconSettle({ color }: { color: string }) {
  return (
    <svg width="18" height="18" viewBox="0 0 20 20" fill="none">
      <path d="M4 8h12M13 5l3 3-3 3" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M16 12H4M7 9l-3 3 3 3" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

// ─── KPI card ────────────────────────────────────────────────────────────────

const KPI_CONFIG = [
  { key: "totalUsers", label: "Total users", accent: "#6E59C7", Icon: IconUsers },
  { key: "activeGroups", label: "Active groups", accent: "#5BA8E0", Icon: IconGroups },
  { key: "expensesTracked", label: "Expenses tracked", accent: "#2DC4B0", Icon: IconExpenses },
  { key: "settlementsPerWeek", label: "Settlements / wk", accent: "#E0B23C", Icon: IconSettle },
] as const;

function Kpi({
  label,
  value,
  accent,
  Icon,
  delta,
}: {
  label: string;
  value: string;
  accent: string;
  Icon: React.ComponentType<{ color: string }>;
  delta?: number;
}) {
  return (
    <Card style={{ padding: "20px 22px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
        <div
          style={{
            width: 40,
            height: 40,
            borderRadius: 12,
            background: `${accent}22`,
            border: `1px solid ${accent}44`,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            flex: "none",
          }}
        >
          <Icon color={accent} />
        </div>
        {delta !== undefined && (
          <span
            style={{
              fontSize: 11,
              fontWeight: 700,
              padding: "3px 8px",
              borderRadius: 7,
              background: delta >= 0 ? "rgba(45,212,167,.12)" : "rgba(242,104,95,.12)",
              color: delta >= 0 ? "#2DC4B0" : "#F2685F",
            }}
          >
            {delta >= 0 ? "+" : ""}{delta}%
          </span>
        )}
      </div>
      <div
        style={{
          fontFamily: "var(--font-display)",
          fontWeight: 800,
          fontSize: 32,
          letterSpacing: "-.03em",
          marginTop: 16,
          fontVariantNumeric: "tabular-nums",
          lineHeight: 1,
        }}
      >
        {value}
      </div>
      <div style={{ fontSize: 12, color: "var(--text-dim)", marginTop: 6 }}>{label}</div>
    </Card>
  );
}

// ─── Status donut ─────────────────────────────────────────────────────────────

const STATUS_COLORS: Record<string, string> = {
  active: "#2DC4B0",
  idle: "#8E7BE0",
  new: "#5BA8E0",
  suspended: "#F2685F",
};

function StatusDonut({ data }: { data: { status: string; count: number }[] }) {
  const total = data.reduce((s, b) => s + b.count, 0);
  const hasData = total > 0;
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
      <div style={{ flex: "none" }}>
        <PieChart width={90} height={90}>
          <Pie
            data={hasData ? data : [{ status: "empty", count: 1 }]}
            cx={40}
            cy={40}
            innerRadius={26}
            outerRadius={40}
            dataKey="count"
            strokeWidth={0}
            startAngle={90}
            endAngle={-270}
          >
            {hasData
              ? data.map((b) => <Cell key={b.status} fill={STATUS_COLORS[b.status] ?? "#333"} />)
              : <Cell fill="rgba(255,255,255,.07)" />}
          </Pie>
        </PieChart>
      </div>
      <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 8 }}>
        {data.map((b) => (
          <div key={b.status} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12 }}>
            <span style={{ width: 8, height: 8, borderRadius: 3, background: STATUS_COLORS[b.status], flex: "none" }} />
            <span style={{ flex: 1, color: "var(--text-dim)", textTransform: "capitalize" }}>{b.status}</span>
            <span style={{ fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>{b.count}</span>
            <span style={{ color: "var(--text-faint)", minWidth: 36, textAlign: "right", fontVariantNumeric: "tabular-nums" }}>
              {total ? Math.round((b.count / total) * 100) : 0}%
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Activity kind icon ───────────────────────────────────────────────────────

function KindDot({ kind }: { kind: string }) {
  const colors: Record<string, string> = {
    expense: "#6E59C7",
    settlement: "#2DC4B0",
    group_new: "#5BA8E0",
    loan: "#E0B23C",
    flag: "#F2685F",
  };
  return (
    <span
      style={{
        width: 8,
        height: 8,
        borderRadius: "50%",
        background: colors[kind] ?? "var(--text-faint)",
        display: "inline-block",
        flex: "none",
      }}
    />
  );
}

// ─── Custom tooltip ───────────────────────────────────────────────────────────

function ChartTip({ active, payload, label }: { active?: boolean; payload?: { color: string; name: string; value: number }[]; label?: string }) {
  if (!active || !payload?.length) return null;
  return (
    <div
      style={{
        background: "var(--surface-2)",
        border: "1px solid var(--hairline-2)",
        borderRadius: 10,
        padding: "8px 14px",
        fontSize: 12,
      }}
    >
      <div style={{ color: "var(--text-dim)", marginBottom: 6 }}>{label ? fmtDate(label) : ""}</div>
      {payload.map((p) => (
        <div key={p.name} style={{ color: p.color, display: "flex", gap: 8, alignItems: "center" }}>
          <span style={{ textTransform: "capitalize" }}>{p.name}</span>
          <span style={{ fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>{p.value}</span>
        </div>
      ))}
    </div>
  );
}

// ─── Main ─────────────────────────────────────────────────────────────────────

export function Overview() {
  const { data, isLoading, error } = useQuery({
    queryKey: ["overview"],
    queryFn: () => api.get<AdminOverviewDto>("/api/admin/overview"),
  });

  if (isLoading) return <CenteredMessage>Loading overview…</CenteredMessage>;
  if (error || !data) return <CenteredMessage>Could not load the overview.</CenteredMessage>;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>

      {/* KPI row */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 14 }}>
        {KPI_CONFIG.map(({ key, label, accent, Icon }) => {
          const raw = data.kpis[key as keyof typeof data.kpis];
          const delta = data.kpis.deltas[key as keyof typeof data.kpis.deltas] as number | undefined;
          let display: string;
          if (key === "expensesTracked") {
            display = `${fmt(Math.round(Number(raw)))} Br`;
          } else {
            display = fmt(Number(raw));
          }
          return <Kpi key={key} label={label} value={display} accent={accent} Icon={Icon} delta={delta} />;
        })}
      </div>

      {/* Activity chart + Status breakdown */}
      <div style={{ display: "grid", gridTemplateColumns: "1.75fr 1fr", gap: 14 }}>
        <Card>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 4 }}>
            <div>
              <div style={{ fontSize: 14, fontWeight: 700, letterSpacing: "-.01em" }}>Activity</div>
              <div style={{ fontSize: 11, color: "var(--text-faint)", marginTop: 2 }}>
                Expenses &amp; settlements · last 14 days
              </div>
            </div>
            <div style={{ display: "flex", gap: 14, fontSize: 11, color: "var(--text-dim)" }}>
              <span style={{ display: "flex", alignItems: "center", gap: 5 }}>
                <span style={{ width: 24, height: 2, background: "#8A78D6", display: "inline-block", borderRadius: 2 }} />
                Expenses
              </span>
              <span style={{ display: "flex", alignItems: "center", gap: 5 }}>
                <span style={{ width: 24, height: 2, background: "#2DC4B0", display: "inline-block", borderRadius: 2 }} />
                Settlements
              </span>
            </div>
          </div>
          <ResponsiveContainer width="100%" height={176}>
            <AreaChart data={data.activity} margin={{ top: 8, right: 4, left: -24, bottom: 0 }}>
              <defs>
                <linearGradient id="jxg-exp" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0" stopColor="#8A78D6" stopOpacity={0.28} />
                  <stop offset="1" stopColor="#8A78D6" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="jxg-set" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0" stopColor="#2DC4B0" stopOpacity={0.2} />
                  <stop offset="1" stopColor="#2DC4B0" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid vertical={false} strokeDasharray="0" stroke="rgba(255,255,255,.05)" />
              <XAxis
                dataKey="date"
                tick={{ fontSize: 10, fill: "var(--text-faint)", fontFamily: "var(--font-mono)" }}
                tickLine={false}
                axisLine={false}
                tickFormatter={fmtDate}
                interval="preserveStartEnd"
              />
              <YAxis
                tick={{ fontSize: 10, fill: "var(--text-faint)" }}
                tickLine={false}
                axisLine={false}
                allowDecimals={false}
              />
              <Tooltip content={<ChartTip />} cursor={{ stroke: "rgba(255,255,255,.1)", strokeWidth: 1 }} />
              <Area
                type="monotone"
                dataKey="expenses"
                stroke="#8A78D6"
                strokeWidth={2}
                fill="url(#jxg-exp)"
                dot={false}
                activeDot={{ r: 4, fill: "#8A78D6", strokeWidth: 0 }}
              />
              <Area
                type="monotone"
                dataKey="settlements"
                stroke="#2DC4B0"
                strokeWidth={2}
                fill="url(#jxg-set)"
                dot={false}
                activeDot={{ r: 4, fill: "#2DC4B0", strokeWidth: 0 }}
              />
            </AreaChart>
          </ResponsiveContainer>
        </Card>

        <Card>
          <div style={{ fontSize: 14, fontWeight: 700, letterSpacing: "-.01em", marginBottom: 2 }}>Users by status</div>
          <div style={{ fontSize: 11, color: "var(--text-faint)", marginBottom: 18 }}>across all groups</div>
          <StatusDonut data={data.statusBreakdown} />
        </Card>
      </div>

      {/* Recent activity + Top groups */}
      <div style={{ display: "grid", gridTemplateColumns: "1.4fr 1fr", gap: 14 }}>
        <Card>
          <div style={{ fontSize: 14, fontWeight: 700, letterSpacing: "-.01em", marginBottom: 16 }}>Recent activity</div>
          {data.recent.length === 0 && (
            <div style={{ fontSize: 13, color: "var(--text-faint)", padding: "8px 0" }}>No recent activity.</div>
          )}
          <div style={{ display: "flex", flexDirection: "column" }}>
            {data.recent.map((r, i) => (
              <div
                key={r.id}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 12,
                  padding: "11px 0",
                  borderBottom: i < data.recent.length - 1 ? "1px solid rgba(255,255,255,.05)" : "none",
                }}
              >
                <KindDot kind={r.kind} />
                <div style={{ flex: 1, fontSize: 13, lineHeight: 1.35 }}>{r.text}</div>
                <span style={{ fontSize: 11, color: "var(--text-faint)", flex: "none", fontVariantNumeric: "tabular-nums" }}>
                  {fmtDate(r.at)}
                </span>
              </div>
            ))}
          </div>
        </Card>

        <Card>
          <div style={{ fontSize: 14, fontWeight: 700, letterSpacing: "-.01em", marginBottom: 18 }}>Top groups by volume</div>
          {data.topGroups.length === 0 && (
            <div style={{ fontSize: 13, color: "var(--text-faint)" }}>No group data yet.</div>
          )}
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            {data.topGroups.map((g, i) => {
              const max = Number(data.topGroups[0]?.volume ?? 1) || 1;
              const pct = Math.max(6, Math.round((Number(g.volume) / max) * 100));
              return (
                <div key={g.id}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 7 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <span
                        style={{
                          fontFamily: "var(--font-mono)",
                          fontSize: 10,
                          color: "var(--text-faint)",
                          width: 16,
                          textAlign: "right",
                          flex: "none",
                        }}
                      >
                        {i + 1}
                      </span>
                      <span style={{ fontSize: 13, fontWeight: 600 }}>{g.name}</span>
                    </div>
                    <span style={{ fontSize: 13, fontWeight: 700, fontVariantNumeric: "tabular-nums", color: "var(--text-dim)" }}>
                      {fmt(Math.round(Number(g.volume)))} Br
                    </span>
                  </div>
                  <div style={{ height: 5, background: "var(--track)", borderRadius: 3, overflow: "hidden", marginLeft: 24 }}>
                    <div
                      style={{
                        width: `${pct}%`,
                        height: "100%",
                        background: `linear-gradient(90deg, #6E59C7 0%, #8A78D6 100%)`,
                        borderRadius: 3,
                        transition: "width .4s ease",
                      }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </Card>
      </div>

    </div>
  );
}
