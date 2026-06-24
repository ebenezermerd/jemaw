import { useQuery } from "@tanstack/react-query";
import { api } from "../lib/api.js";
import type { AdminExpenseDto } from "@jemaw/shared/types";
import { Card, StatusPill, CenteredMessage } from "../ui/primitives.js";

const COLS = "2.2fr 1.4fr 1.2fr 1fr 1fr 0.9fr";

export function Expenses() {
  const { data, isLoading, error } = useQuery({
    queryKey: ["expenses"],
    queryFn: () => api.get<AdminExpenseDto[]>("/api/admin/expenses"),
  });

  if (isLoading) return <CenteredMessage>Loading expenses…</CenteredMessage>;
  if (error || !data) return <CenteredMessage>Could not load expenses.</CenteredMessage>;

  return (
    <Card style={{ padding: 0, overflow: "hidden" }}>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: COLS,
          gap: 12,
          padding: "13px 20px",
          borderBottom: "1px solid var(--hairline)",
          fontFamily: "var(--font-mono)",
          fontSize: 10,
          letterSpacing: ".1em",
          textTransform: "uppercase",
          color: "var(--text-faint)",
        }}
      >
        <span>Description</span>
        <span>Group</span>
        <span>Payer</span>
        <span>Amount</span>
        <span>Date</span>
        <span>State</span>
      </div>
      {data.map((e) => (
        <div
          key={e.id}
          className="jx-row"
          style={{ display: "grid", gridTemplateColumns: COLS, gap: 12, padding: "13px 20px", borderBottom: "1px solid rgba(255,255,255,.04)", alignItems: "center" }}
        >
          <div>
            <div style={{ fontSize: 14, fontWeight: 600 }}>{e.description}</div>
            <div style={{ fontSize: 11, color: "var(--text-faint)", textTransform: "capitalize" }}>{e.kind} · {e.source.replace("_", " ")}</div>
          </div>
          <span style={{ fontSize: 13, color: "var(--accent-soft)" }}>{e.groupName}</span>
          <span style={{ fontSize: 13 }}>{e.payerName}</span>
          <span style={{ fontSize: 13, fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>{e.amount} {e.currency}</span>
          <span style={{ fontSize: 13, color: "var(--text-dim)" }}>{new Date(e.occurredAt).toLocaleDateString()}</span>
          <span><StatusPill status={e.voided ? "failed" : "active"} /></span>
        </div>
      ))}
      {data.length === 0 && <CenteredMessage>No expenses yet.</CenteredMessage>}
    </Card>
  );
}
