import { useQuery } from "@tanstack/react-query";
import { api } from "../lib/api.js";
import type { AdminGroupDto } from "@jemaw/shared/types";
import { Card, Avatar, CenteredMessage } from "../ui/primitives.js";

const COLS = "2.4fr 1fr 1.2fr 1.2fr";

export function Groups() {
  const { data, isLoading, error } = useQuery({
    queryKey: ["groups"],
    queryFn: () => api.get<AdminGroupDto[]>("/api/admin/groups"),
  });

  if (isLoading) return <CenteredMessage>Loading groups…</CenteredMessage>;
  if (error || !data) return <CenteredMessage>Could not load groups.</CenteredMessage>;

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
        <span>Group</span>
        <span>Members</span>
        <span>Volume</span>
        <span>Created</span>
      </div>
      {data.map((g) => (
        <div
          key={g.id}
          className="jx-row"
          style={{ display: "grid", gridTemplateColumns: COLS, gap: 12, padding: "13px 20px", borderBottom: "1px solid rgba(255,255,255,.04)", alignItems: "center" }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 11 }}>
            <Avatar label={g.name} />
            <div>
              <div style={{ fontSize: 14, fontWeight: 600 }}>{g.name}</div>
              <div style={{ fontSize: 11, color: "var(--text-faint)" }}>{g.defaultCurrency}</div>
            </div>
          </div>
          <span style={{ fontSize: 13, fontVariantNumeric: "tabular-nums" }}>{g.memberCount}</span>
          <span style={{ fontSize: 13, fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>{g.volume} Br</span>
          <span style={{ fontSize: 13, color: "var(--text-dim)" }}>{new Date(g.createdAt).toLocaleDateString()}</span>
        </div>
      ))}
      {data.length === 0 && <CenteredMessage>No groups yet.</CenteredMessage>}
    </Card>
  );
}
