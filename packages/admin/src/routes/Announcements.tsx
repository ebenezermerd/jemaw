/**
 * Compose and send broadcasts through the bot. Groups and users are picked
 * from lists, not typed as ids. History shows how each send went.
 */
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../lib/api.js";
import type {
  AdminGroupDto,
  AdminUserDto,
  AnnouncementAudience,
  AnnouncementDto,
  CreateAnnouncementInput,
} from "@jemaw/shared/types";
import { titleCase } from "../lib/format.js";
import { GhostButton, fieldStyle } from "../ui/Dialog.js";
import { Loader, SkeletonList } from "../ui/Loader.js";
import { Card, CenteredMessage, PrimaryButton, StatusPill } from "../ui/primitives.js";
import { useBotStatus } from "../ui/BotStatus.js";

interface Stats {
  delivered?: number;
  failed?: number;
  recipients?: number;
  errors?: { label: string; error: string }[];
}

const errText = (e: unknown) => (e instanceof Error ? e.message : "Something went wrong.");

export function Announcements() {
  const qc = useQueryClient();
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [audience, setAudience] = useState<AnnouncementAudience>("all_groups");
  const [targetId, setTargetId] = useState("");
  const [userQuery, setUserQuery] = useState("");

  const { data: status } = useBotStatus();
  const { data, isLoading } = useQuery({
    queryKey: ["announcements"],
    queryFn: () => api.get<AnnouncementDto[]>("/api/admin/announcements"),
    // Poll while something is on its way out.
    refetchInterval: (q) =>
      q.state.data?.some((a) => a.status === "queued" || a.status === "sending") ? 3000 : false,
  });
  const { data: groups = [] } = useQuery({
    queryKey: ["groups"],
    queryFn: () => api.get<AdminGroupDto[]>("/api/admin/groups"),
  });
  const { data: users = [] } = useQuery({
    queryKey: ["users"],
    queryFn: () => api.get<AdminUserDto[]>("/api/admin/users"),
    enabled: audience === "user",
  });

  const refresh = () => {
    void qc.invalidateQueries({ queryKey: ["announcements"] });
    void qc.invalidateQueries({ queryKey: ["activity"] });
  };
  const create = useMutation({
    mutationFn: (queue: boolean) => {
      const payload: CreateAnnouncementInput = {
        title: title.trim(),
        body: body.trim(),
        audience,
        ...(audience !== "all_groups" ? { targetId } : {}),
        queue,
      };
      return api.post<AnnouncementDto>("/api/admin/announcements", payload);
    },
    onSuccess: () => {
      setTitle("");
      setBody("");
      setTargetId("");
      setUserQuery("");
      refresh();
    },
  });
  const send = useMutation({
    mutationFn: (id: string) => api.post(`/api/admin/announcements/${id}/send`),
    onSettled: refresh,
  });
  const remove = useMutation({
    mutationFn: (id: string) => api.delete(`/api/admin/announcements/${id}`),
    onSettled: refresh,
  });

  // Only real people can get a DM: manual members have no Telegram account.
  const userMatches = useMemo(() => {
    const q = userQuery.trim().toLowerCase();
    return users
      .filter((u) => !u.isManual)
      .filter((u) => !q || u.displayName.toLowerCase().includes(q) || (u.username ?? "").toLowerCase().includes(q) || u.telegramUserId.includes(q))
      .slice(0, 8);
  }, [users, userQuery]);
  const pickedUser = users.find((u) => u.telegramUserId === targetId);
  const recipients =
    audience === "all_groups" ? `${groups.length} group chats` : audience === "group" ? groups.find((g) => g.id === targetId)?.name ?? "—" : pickedUser ? titleCase(pickedUser.displayName) : "—";

  const canSubmit = title.trim().length > 0 && body.trim().length > 0 && (audience === "all_groups" || targetId.length > 0);
  const sendingOff = status && !status.configured;

  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1.2fr", gap: 16, alignItems: "start" }}>
      <Card>
        <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 16 }}>Compose broadcast</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={120} placeholder="Title" style={fieldStyle} />
          <textarea value={body} onChange={(e) => setBody(e.target.value)} maxLength={4000} placeholder="Message…" rows={5} style={{ ...fieldStyle, resize: "vertical" }} />
          <div style={{ display: "flex", gap: 7 }}>
            {(
              [
                ["all_groups", "All groups"],
                ["group", "One group"],
                ["user", "One person"],
              ] as const
            ).map(([key, label]) => (
              <button
                key={key}
                onClick={() => {
                  setAudience(key);
                  setTargetId("");
                }}
                style={{
                  flex: 1,
                  fontSize: 13,
                  fontWeight: 600,
                  padding: "9px 10px",
                  borderRadius: 9,
                  cursor: "pointer",
                  color: audience === key ? "#fff" : "rgba(244,242,251,.6)",
                  background: audience === key ? "#6E59C7" : "transparent",
                  border: audience === key ? "none" : "1px solid rgba(255,255,255,.1)",
                }}
              >
                {label}
              </button>
            ))}
          </div>
          {audience === "group" && (
            <select aria-label="Group" value={targetId} onChange={(e) => setTargetId(e.target.value)} style={fieldStyle}>
              <option value="">Choose a group…</option>
              {groups.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.name} · {g.memberCount} members
                </option>
              ))}
            </select>
          )}
          {audience === "user" && (
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <input value={userQuery} onChange={(e) => setUserQuery(e.target.value)} placeholder="Search people by name, @username or id" style={fieldStyle} />
              <div style={{ border: "1px solid var(--hairline-2)", borderRadius: 10, overflow: "hidden" }}>
                {userMatches.length === 0 ? (
                  <div style={{ padding: 12, fontSize: 13, color: "var(--text-dim)" }}>No one matches.</div>
                ) : (
                  userMatches.map((u) => (
                    <button
                      key={u.telegramUserId}
                      onClick={() => setTargetId(u.telegramUserId)}
                      style={{
                        display: "flex",
                        width: "100%",
                        gap: 8,
                        alignItems: "center",
                        padding: "9px 12px",
                        border: "none",
                        borderBottom: "1px solid rgba(255,255,255,.04)",
                        background: targetId === u.telegramUserId ? "rgba(110,89,199,.2)" : "transparent",
                        color: "var(--text)",
                        fontSize: 13,
                        cursor: "pointer",
                        textAlign: "left",
                      }}
                    >
                      <span style={{ flex: 1 }}>{titleCase(u.displayName)}</span>
                      <span style={{ color: "var(--text-dim)", fontSize: 12 }}>{u.username ? `@${u.username}` : u.telegramUserId}</span>
                    </button>
                  ))
                )}
              </div>
              <div style={{ fontSize: 11.5, color: "var(--text-faint)" }}>
                Telegram only delivers a DM if this person has started a private chat with the bot.
              </div>
            </div>
          )}

          {(title || body) && (
            <div>
              <div style={{ fontSize: 12, fontWeight: 600, color: "var(--text-dim)", marginBottom: 6 }}>Preview · to {recipients}</div>
              <div style={{ background: "#1E1C2A", borderRadius: "14px 14px 14px 4px", padding: "11px 14px", fontSize: 14, lineHeight: 1.5, whiteSpace: "pre-wrap" }}>
                <b>{title}</b>
                {body && `\n\n${body}`}
              </div>
            </div>
          )}

          <div style={{ display: "flex", gap: 10, marginTop: 4 }}>
            <div style={{ flex: 1, display: "flex" }}>
              <GhostButton onClick={() => create.mutate(false)} disabled={!canSubmit || create.isPending}>
                Save draft
              </GhostButton>
            </div>
            <PrimaryButton onClick={() => create.mutate(true)} disabled={!canSubmit || create.isPending || Boolean(sendingOff)}>
              {create.isPending ? "Sending…" : `Send to ${recipients}`}
            </PrimaryButton>
          </div>
          {sendingOff && <div style={{ fontSize: 12, color: "var(--warn)" }}>Sending is off: the API has no bot token yet. Drafts still save.</div>}
          {create.isError && <div style={{ fontSize: 12, color: "var(--danger)" }}>{errText(create.error)}</div>}
        </div>
      </Card>

      <Card style={{ padding: 0, overflow: "hidden" }}>
        <div style={{ fontSize: 15, fontWeight: 700, padding: "20px 20px 12px" }}>History</div>
        {isLoading && <SkeletonList count={4} height={52} />}
        <div className="jx-scroll" style={{ maxHeight: 640, overflowY: "auto" }}>
          {data?.map((a) => {
            const st = a.stats as Stats;
            const target =
              a.audience === "all_groups"
                ? "All groups"
                : a.audience === "group"
                  ? `Group · ${groups.find((g) => g.id === a.targetId)?.name ?? a.targetId}`
                  : `Person · ${a.targetId}`;
            const busy = (send.isPending && send.variables === a.id) || (remove.isPending && remove.variables === a.id);
            return (
              <div key={a.id} style={{ padding: "13px 20px", borderTop: "1px solid rgba(255,255,255,.05)" }}>
                <div style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 14, fontWeight: 600 }}>{a.title}</div>
                    <div style={{ fontSize: 12, color: "var(--text-dim)", marginTop: 2 }}>
                      {target} · {new Date(a.sentAt ?? a.createdAt).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}
                    </div>
                    {(a.status === "sent" || a.status === "failed") && st.recipients !== undefined && (
                      <div style={{ fontSize: 12, marginTop: 4, color: st.failed ? "var(--warn)" : "var(--success)" }}>
                        Delivered to {st.delivered ?? 0} of {st.recipients}
                        {st.failed ? ` · ${st.failed} failed` : ""}
                      </div>
                    )}
                    {st.errors?.map((er, i) => (
                      <div key={i} style={{ fontSize: 11.5, color: "var(--danger)", marginTop: 2 }}>
                        {er.label}: {er.error}
                      </div>
                    ))}
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    {(a.status === "queued" || a.status === "sending" || busy) && <Loader size={16} />}
                    <StatusPill status={a.status} />
                  </div>
                </div>
                {(a.status === "draft" || a.status === "failed") && (
                  <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
                    <GhostButton onClick={() => send.mutate(a.id)} disabled={busy || Boolean(sendingOff)}>
                      {a.status === "failed" ? "Retry send" : "Send now"}
                    </GhostButton>
                    <GhostButton tone="danger" onClick={() => remove.mutate(a.id)} disabled={busy}>
                      Delete
                    </GhostButton>
                  </div>
                )}
              </div>
            );
          })}
        </div>
        {data && data.length === 0 && <CenteredMessage>No announcements yet.</CenteredMessage>}
        {(send.isError || remove.isError) && (
          <div style={{ fontSize: 12, color: "var(--danger)", padding: "0 20px 14px" }}>{errText(send.error ?? remove.error)}</div>
        )}
      </Card>
    </div>
  );
}
