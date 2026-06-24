import { useQuery } from "@tanstack/react-query";
import {
  AreaChart,
  Area,
  Line,
  XAxis,
  ResponsiveContainer,
  Tooltip,
} from "recharts";
import { api } from "../lib/api.js";
import type { AdminOverviewDto } from "@jemaw/shared/types";
import { Card, CenteredMessage } from "../ui/primitives.js";

const DONUT_COLORS: Record<string, string> = {
  active: "#2DC4B0",
  idle: "#8E7BE0",
  new: "#E0B23C",
  suspended: "#F2685F",
};

function Kpi({ label, value, accent }: { label: string; value: string; accent: string }) {
  return (
    <Card style={{ padding: 18 }}>
      <div
        style={{
          width: 38,
          height: 38,
          borderRadius: 11,
          background: `${accent}28`,
          border: `1px solid ${accent}55`,
        }}
      />
      <div style={{ fontFamily: "var(--font-display)", fontWeight: 800, fontSize: 32, letterSpacing: "-.02em", marginTop: 14, fontVariantNumeric: "tabular-nums" }}>
        {value}
      </div>
      <div style={{ fontSize: 13, color: "var(--text-dim)" }}>{label}</div>
    </Card>
  );
}

export function Overview() {
  const { data, isLoading, error } = useQuery({
    queryKey: ["overview"],
    queryFn: () => api.get<AdminOverviewDto>("/api/admin/overview"),
  });

  if (isLoading) return <CenteredMessage>Loading overview…</CenteredMessage>;
  if (error || !data) return <CenteredMessage>Could not load the overview.</CenteredMessage>;

  const total = data.statusBreakdown.reduce((s, b) => s + b.count, 0);

  return (
    <div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 16, marginBottom: 18 }}>
        <Kpi label="Total users" value={data.kpis.totalUsers.toLocaleString()} accent="#6E59C7" />
        <Kpi label="Active groups" value={data.kpis.activeGroups.toLocaleString()} accent="#5BA8E0" />
        <Kpi label="Expenses tracked" value={`${data.kpis.expensesTracked} Br`} accent="#2DC4B0" />
        <Kpi label="Settlements / week" value={data.kpis.settlementsPerWeek.toLocaleString()} accent="#E0B23C" />
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1.7fr 1fr", gap: 16, marginBottom: 18 }}>
        <Card>
          <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 4 }}>Activity</div>
          <div style={{ fontSize: 12, color: "var(--text-faint)", marginBottom: 18 }}>
            Expenses &amp; settlements logged · last 14 days
          </div>
          <ResponsiveContainer width="100%" height={180}>
            <AreaChart data={data.activity} margin={{ top: 4, right: 8, left: 8, bottom: 0 }}>
              <defs>
                <linearGradient id="jxg" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0" stopColor="#8A78D6" stopOpacity={0.34} />
                  <stop offset="1" stopColor="#8A78D6" stopOpacity={0} />
                </linearGradient>
              </defs>
              <XAxis dataKey="date" hide />
              <Tooltip
                contentStyle={{ background: "var(--surface)", border: "1px solid var(--hairline-2)", borderRadius: 10, fontSize: 12 }}
                labelStyle={{ color: "var(--text-dim)" }}
              />
              <Area type="monotone" dataKey="expenses" stroke="#8A78D6" strokeWidth={2.5} fill="url(#jxg)" />
              <Line type="monotone" dataKey="settlements" stroke="#2DC4B0" strokeWidth={2.5} dot={false} />
            </AreaChart>
          </ResponsiveContainer>
        </Card>

        <Card>
          <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 4 }}>Users by status</div>
          <div style={{ fontSize: 12, color: "var(--text-faint)", marginBottom: 18 }}>across all groups</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {data.statusBreakdown.map((b) => (
              <div key={b.status} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12 }}>
                <span style={{ width: 9, height: 9, borderRadius: 3, background: DONUT_COLORS[b.status] }} />
                <span style={{ flex: 1, color: "var(--text-dim)", textTransform: "capitalize" }}>{b.status}</span>
                <span style={{ fontWeight: 700 }}>{b.count}</span>
                <span style={{ color: "var(--text-faint)", width: 44, textAlign: "right" }}>
                  {total ? Math.round((b.count / total) * 100) : 0}%
                </span>
              </div>
            ))}
          </div>
        </Card>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1.4fr 1fr", gap: 16 }}>
        <Card>
          <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 16 }}>Recent activity</div>
          <div style={{ display: "flex", flexDirection: "column" }}>
            {data.recent.length === 0 && <div style={{ fontSize: 13, color: "var(--text-faint)" }}>No recent activity.</div>}
            {data.recent.map((r) => (
              <div key={r.id} style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 0", borderBottom: "1px solid rgba(255,255,255,.05)" }}>
                <div style={{ flex: 1, fontSize: 13 }}>{r.text}</div>
                <span style={{ fontSize: 11, color: "var(--text-faint)" }}>{new Date(r.at).toLocaleDateString()}</span>
              </div>
            ))}
          </div>
        </Card>

        <Card>
          <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 16 }}>Top groups by volume</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            {data.topGroups.map((g, i) => {
              const max = Number(data.topGroups[0]?.volume ?? 1) || 1;
              const pct = Math.max(6, Math.round((Number(g.volume) / max) * 100));
              return (
                <div key={g.id}>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                    <span style={{ fontSize: 13, fontWeight: 600 }}>{g.name}</span>
                    <span style={{ fontSize: 13, fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>{g.volume} Br</span>
                  </div>
                  <div style={{ height: 7, background: "var(--track)", borderRadius: 4, overflow: "hidden" }}>
                    <div style={{ width: `${pct}%`, height: "100%", background: "linear-gradient(90deg,#6E59C7,#8A78D6)", borderRadius: 4 }} />
                  </div>
                  {i === 99 && null}
                </div>
              );
            })}
          </div>
        </Card>
      </div>
    </div>
  );
}
