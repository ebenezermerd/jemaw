/**
 * Balances analytics (Recharts): summary stat cards, net-per-member diverging
 * bars, share-of-spend donut, and spending-over-time area. All derived
 * client-side from balances + the live expense list. Themed to our tokens.
 */
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  Cell,
  XAxis,
  YAxis,
  Tooltip,
  PieChart,
  Pie,
  AreaChart,
  Area,
  CartesianGrid,
} from "recharts";
import type { BalanceDto, ExpenseDto } from "@jemaw/shared/types";
import { formatMoney } from "../lib/money.js";

const SLICE = [
  "#34D399",
  "#22C55E",
  "#10B981",
  "#6EE7B7",
  "#A7F3D0",
  "#059669",
  "#84CC16",
  "#F59E0B",
];

export function BalancesAnalytics({
  balances,
  expenses,
  members,
  currency,
}: {
  balances: BalanceDto[];
  expenses: ExpenseDto[];
  members: { id: string; displayName: string }[];
  currency: string;
}) {
  const nameOf = (id: string) =>
    members.find((m) => m.id === id)?.displayName ?? "Member";

  // ── derived data ──
  const totalSpend = expenses.reduce((a, e) => a + Number(e.amount), 0);
  const avg = expenses.length ? totalSpend / expenses.length : 0;

  const netData = [...balances]
    .map((b) => ({ name: b.displayName, net: Number(b.net) }))
    .sort((a, b) => b.net - a.net);

  // share of spend = sum each member paid
  const paidBy = new Map<string, number>();
  for (const e of expenses) {
    paidBy.set(
      e.payerMemberId,
      (paidBy.get(e.payerMemberId) ?? 0) + Number(e.amount),
    );
  }
  const shareData = [...paidBy.entries()]
    .map(([id, v]) => ({ name: nameOf(id), value: v }))
    .filter((d) => d.value > 0)
    .sort((a, b) => b.value - a.value);

  // spending over time by day
  const byDay = new Map<string, number>();
  for (const e of expenses) {
    const day = e.occurredAt.slice(0, 10);
    byDay.set(day, (byDay.get(day) ?? 0) + Number(e.amount));
  }
  const trendData = [...byDay.entries()]
    .sort((a, b) => (a[0] < b[0] ? -1 : 1))
    .map(([day, v]) => ({ day: day.slice(5), value: Number(v.toFixed(2)) }));

  const fmt = (v: number) => formatMoney(v.toFixed(2), currency);

  return (
    <div style={{ display: "grid", gap: 16 }}>
      {/* summary stat cards */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
        <StatCard label="Total spend" value={fmt(totalSpend)} />
        <StatCard label="Expenses" value={String(expenses.length)} />
        <StatCard label="Members" value={String(members.length)} />
        <StatCard label="Avg / expense" value={fmt(avg)} />
      </div>

      {/* net per member — diverging bars */}
      <Panel title="Net per member">
        <ResponsiveContainer width="100%" height={Math.max(120, netData.length * 38)}>
          <BarChart data={netData} layout="vertical" margin={{ left: 8, right: 8 }}>
            <XAxis type="number" hide />
            <YAxis
              type="category"
              dataKey="name"
              width={64}
              tick={{ fill: "var(--text-muted)", fontSize: 12 }}
              axisLine={false}
              tickLine={false}
            />
            <Tooltip
              cursor={{ fill: "var(--surface-elevated)" }}
              contentStyle={tooltipStyle}
              labelStyle={tooltipLabelStyle}
              itemStyle={tooltipItemStyle}
              formatter={(v: number) => fmt(v)}
            />
            <Bar dataKey="net" radius={4}>
              {netData.map((d, i) => (
                <Cell key={i} fill={d.net >= 0 ? "var(--accent)" : "var(--warn)"} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </Panel>

      {/* share of spend — donut */}
      {shareData.length > 0 && (
        <Panel title="Share of spend">
          <ResponsiveContainer width="100%" height={200}>
            <PieChart>
              <Pie
                data={shareData}
                dataKey="value"
                nameKey="name"
                innerRadius={52}
                outerRadius={80}
                paddingAngle={2}
                stroke="none"
              >
                {shareData.map((_, i) => (
                  <Cell key={i} fill={SLICE[i % SLICE.length]} />
                ))}
              </Pie>
              <Tooltip contentStyle={tooltipStyle}
              labelStyle={tooltipLabelStyle}
              itemStyle={tooltipItemStyle} formatter={(v: number) => fmt(v)} />
            </PieChart>
          </ResponsiveContainer>
          <Legend data={shareData} />
        </Panel>
      )}

      {/* spending over time — area */}
      {trendData.length > 1 && (
        <Panel title="Spending over time">
          <ResponsiveContainer width="100%" height={180}>
            <AreaChart data={trendData} margin={{ left: 4, right: 8, top: 8 }}>
              <defs>
                <linearGradient id="spendFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="var(--accent)" stopOpacity={0.4} />
                  <stop offset="100%" stopColor="var(--accent)" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid stroke="var(--border)" vertical={false} />
              <XAxis
                dataKey="day"
                tick={{ fill: "var(--text-faint)", fontSize: 11 }}
                axisLine={false}
                tickLine={false}
              />
              <YAxis hide />
              <Tooltip contentStyle={tooltipStyle}
              labelStyle={tooltipLabelStyle}
              itemStyle={tooltipItemStyle} formatter={(v: number) => fmt(v)} />
              <Area
                type="monotone"
                dataKey="value"
                stroke="var(--accent)"
                strokeWidth={2}
                fill="url(#spendFill)"
              />
            </AreaChart>
          </ResponsiveContainer>
        </Panel>
      )}
    </div>
  );
}

const tooltipStyle: React.CSSProperties = {
  background: "var(--surface-elevated)",
  border: "1px solid var(--border-strong)",
  borderRadius: 8,
  color: "var(--text)",
  fontSize: 12,
};

// Recharts renders the label + each item with their own inline colors, which
// otherwise default to dark and become unreadable in dark theme. Force tokens.
const tooltipLabelStyle: React.CSSProperties = { color: "var(--text)" };
const tooltipItemStyle: React.CSSProperties = { color: "var(--text)" };

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div
      style={{
        background: "var(--surface)",
        border: "1px solid var(--border)",
        borderRadius: "var(--r-lg)",
        padding: 14,
      }}
    >
      <div className="tnum t-heading" style={{ fontVariantNumeric: "tabular-nums" }}>
        {value}
      </div>
      <div className="t-caption" style={{ color: "var(--text-muted)" }}>
        {label}
      </div>
    </div>
  );
}

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section
      style={{
        background: "var(--surface)",
        border: "1px solid var(--border)",
        borderRadius: "var(--r-lg)",
        padding: 14,
      }}
    >
      <h2 className="t-label" style={{ color: "var(--text-muted)", margin: "0 0 10px" }}>
        {title}
      </h2>
      {children}
    </section>
  );
}

function Legend({ data }: { data: { name: string; value: number }[] }) {
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 10, marginTop: 8 }}>
      {data.map((d, i) => (
        <span key={d.name} style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <span
            style={{
              width: 10,
              height: 10,
              borderRadius: 3,
              background: SLICE[i % SLICE.length],
            }}
          />
          <span className="t-caption" style={{ color: "var(--text-muted)" }}>
            {d.name}
          </span>
        </span>
      ))}
    </div>
  );
}
