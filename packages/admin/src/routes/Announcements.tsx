import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../lib/api.js";
import type {
  AnnouncementDto,
  CreateAnnouncementInput,
  AnnouncementAudience,
} from "@jemaw/shared/types";
import { Card, StatusPill, PrimaryButton, CenteredMessage } from "../ui/primitives.js";

const inputStyle = {
  width: "100%",
  background: "var(--bg-panel)",
  border: "1px solid var(--hairline-2)",
  borderRadius: 10,
  padding: "11px 13px",
  fontSize: 14,
  color: "var(--text)",
  outline: "none",
} as const;

export function Announcements() {
  const qc = useQueryClient();
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [audience, setAudience] = useState<AnnouncementAudience>("all_groups");
  const [targetId, setTargetId] = useState("");

  const { data, isLoading } = useQuery({
    queryKey: ["announcements"],
    queryFn: () => api.get<AnnouncementDto[]>("/api/admin/announcements"),
  });

  const create = useMutation({
    mutationFn: (queue: boolean) => {
      const payload: CreateAnnouncementInput = {
        title: title.trim(),
        body: body.trim(),
        audience,
        ...(audience !== "all_groups" ? { targetId: targetId.trim() } : {}),
        queue,
      };
      return api.post<AnnouncementDto>("/api/admin/announcements", payload);
    },
    onSuccess: () => {
      setTitle("");
      setBody("");
      setTargetId("");
      qc.invalidateQueries({ queryKey: ["announcements"] });
    },
  });

  const canSubmit =
    title.trim().length > 0 &&
    body.trim().length > 0 &&
    (audience === "all_groups" || targetId.trim().length > 0);

  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1.2fr", gap: 16 }}>
      <Card>
        <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 16 }}>Compose broadcast</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Title" style={inputStyle} />
          <textarea value={body} onChange={(e) => setBody(e.target.value)} placeholder="Message…" rows={5} style={{ ...inputStyle, resize: "vertical" }} />
          <select value={audience} onChange={(e) => setAudience(e.target.value as AnnouncementAudience)} style={inputStyle}>
            <option value="all_groups">All groups</option>
            <option value="group">A specific group</option>
            <option value="user">A specific user</option>
          </select>
          {audience !== "all_groups" && (
            <input
              value={targetId}
              onChange={(e) => setTargetId(e.target.value)}
              placeholder={audience === "group" ? "Group id" : "Telegram user id"}
              style={inputStyle}
            />
          )}
          <div style={{ display: "flex", gap: 10, marginTop: 4 }}>
            <button
              onClick={() => create.mutate(false)}
              disabled={!canSubmit || create.isPending}
              style={{ flex: 1, background: "transparent", border: "1px solid var(--hairline-2)", borderRadius: 12, padding: 12, color: "var(--text)", fontSize: 14, fontWeight: 600, cursor: "pointer" }}
            >
              Save draft
            </button>
            <div style={{ flex: 1 }}>
              <PrimaryButton onClick={() => create.mutate(true)} disabled={!canSubmit || create.isPending}>
                Queue &amp; send
              </PrimaryButton>
            </div>
          </div>
          {create.isError && <div style={{ fontSize: 12, color: "var(--danger)" }}>Failed to create the announcement.</div>}
        </div>
      </Card>

      <Card style={{ padding: 0, overflow: "hidden" }}>
        <div style={{ fontSize: 15, fontWeight: 700, padding: "20px 20px 12px" }}>History</div>
        {isLoading && <CenteredMessage>Loading…</CenteredMessage>}
        {data?.map((a) => (
          <div key={a.id} style={{ display: "flex", alignItems: "flex-start", gap: 12, padding: "13px 20px", borderTop: "1px solid rgba(255,255,255,.05)" }}>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 14, fontWeight: 600 }}>{a.title}</div>
              <div style={{ fontSize: 12, color: "var(--text-dim)", marginTop: 2 }}>
                {a.audience.replace("_", " ")}{a.targetId ? ` · ${a.targetId}` : ""}
              </div>
            </div>
            <StatusPill status={a.status} />
          </div>
        ))}
        {data && data.length === 0 && <CenteredMessage>No announcements yet.</CenteredMessage>}
      </Card>
    </div>
  );
}
