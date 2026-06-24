import { useQuery } from "@tanstack/react-query";
import { api } from "../lib/api.js";
import type { AdminAuditEntryDto } from "@jemaw/shared/types";
import { Card, CenteredMessage } from "../ui/primitives.js";

export function Logs() {
  const { data, isLoading, error } = useQuery({
    queryKey: ["logs"],
    queryFn: () => api.get<AdminAuditEntryDto[]>("/api/admin/logs"),
  });

  if (isLoading) return <CenteredMessage>Loading activity…</CenteredMessage>;
  if (error || !data) return <CenteredMessage>Could not load the audit log.</CenteredMessage>;

  return (
    <Card>
      <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 16 }}>Admin audit log</div>
      {data.length === 0 && <div style={{ fontSize: 13, color: "var(--text-faint)" }}>No admin actions recorded yet.</div>}
      <div style={{ display: "flex", flexDirection: "column" }}>
        {data.map((e) => (
          <div key={e.id} style={{ display: "flex", alignItems: "center", gap: 12, padding: "11px 0", borderBottom: "1px solid rgba(255,255,255,.05)" }}>
            <code style={{ fontFamily: "var(--font-mono)", fontSize: 12, color: "var(--accent-soft)", minWidth: 160 }}>{e.action}</code>
            <div style={{ flex: 1, fontSize: 13 }}>
              {e.actorEmail ?? "system"}
              {e.targetType && (
                <span style={{ color: "var(--text-faint)" }}> · {e.targetType} {e.targetId}</span>
              )}
            </div>
            <span style={{ fontSize: 11, color: "var(--text-faint)" }}>{new Date(e.createdAt).toLocaleString()}</span>
          </div>
        ))}
      </div>
    </Card>
  );
}
