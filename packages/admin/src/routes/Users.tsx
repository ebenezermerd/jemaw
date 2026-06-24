import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../lib/api.js";
import type { AdminUserDto } from "@jemaw/shared/types";
import { Card, StatusPill, Avatar, CenteredMessage } from "../ui/primitives.js";

const COLS = "2.2fr 1.4fr 1fr 1.1fr 1.1fr 0.9fr";

export function Users() {
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const { data, isLoading, error } = useQuery({
    queryKey: ["users"],
    queryFn: () => api.get<AdminUserDto[]>("/api/admin/users"),
  });

  const toggle = useMutation({
    mutationFn: (u: AdminUserDto) =>
      api.post(
        `/api/admin/users/${u.telegramUserId}/${u.isActive ? "suspend" : "activate"}`,
      ),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["users"] }),
  });

  if (isLoading) return <CenteredMessage>Loading users…</CenteredMessage>;
  if (error || !data) return <CenteredMessage>Could not load users.</CenteredMessage>;

  const q = search.trim().toLowerCase();
  const rows = q
    ? data.filter(
        (u) =>
          u.displayName.toLowerCase().includes(q) ||
          (u.username ?? "").toLowerCase().includes(q),
      )
    : data;

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 18 }}>
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by name or @handle…"
          style={{
            flex: 1,
            maxWidth: 340,
            background: "var(--surface)",
            border: "1px solid var(--hairline-2)",
            borderRadius: 11,
            padding: "10px 13px",
            fontSize: 14,
            color: "var(--text)",
            outline: "none",
          }}
        />
        <div style={{ fontSize: 13, fontWeight: 600, color: "#fff", background: "var(--accent)", padding: "9px 14px", borderRadius: 9 }}>
          All · {data.length}
        </div>
      </div>

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
          <span>User</span>
          <span>Telegram</span>
          <span>Groups</span>
          <span>Status</span>
          <span>Last active</span>
          <span />
        </div>
        {rows.map((u) => (
          <div
            key={u.telegramUserId}
            className="jx-row"
            style={{ display: "grid", gridTemplateColumns: COLS, gap: 12, padding: "13px 20px", borderBottom: "1px solid rgba(255,255,255,.04)", alignItems: "center" }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 11 }}>
              <Avatar label={u.displayName} />
              <div>
                <div style={{ fontSize: 14, fontWeight: 600 }}>{u.displayName}</div>
                <div style={{ fontSize: 11, color: "var(--text-faint)" }}>id {u.telegramUserId}</div>
              </div>
            </div>
            <span style={{ fontSize: 13, color: "var(--accent-soft)" }}>{u.username ? `@${u.username}` : "—"}</span>
            <span style={{ fontSize: 13, fontVariantNumeric: "tabular-nums" }}>{u.groupCount}</span>
            <span><StatusPill status={u.status} /></span>
            <span style={{ fontSize: 13, color: "var(--text-dim)" }}>
              {u.lastActiveAt ? new Date(u.lastActiveAt).toLocaleDateString() : "—"}
            </span>
            <button
              onClick={() => toggle.mutate(u)}
              disabled={toggle.isPending}
              style={{
                background: "transparent",
                border: "1px solid var(--hairline-2)",
                borderRadius: 8,
                color: u.isActive ? "var(--danger)" : "var(--success)",
                fontSize: 12,
                fontWeight: 600,
                padding: "6px 10px",
                cursor: "pointer",
              }}
            >
              {u.isActive ? "Suspend" : "Activate"}
            </button>
          </div>
        ))}
        {rows.length === 0 && <CenteredMessage>No users match.</CenteredMessage>}
      </Card>
    </div>
  );
}
