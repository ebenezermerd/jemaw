/**
 * Super admin in the bot: which Telegram accounts the bot treats as Jemaw's
 * owners, how it talks to them, and what they can do in group chats.
 * Everyone can see it; only super admins can change it.
 */
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../lib/api.js";
import type { AdminMeDto, AdminUserDto } from "@jemaw/shared/types";
import type { BotRuntimeConfig } from "@jemaw/shared/runtimeConfig";
import { BOSS_TONES, BOSS_TONE_META, type BossConfig } from "@jemaw/shared/boss";
import { GhostButton, fieldStyle } from "../ui/Dialog.js";
import { Loader, SkeletonList } from "../ui/Loader.js";
import { Card } from "../ui/primitives.js";
import { ToggleRow } from "./GroupManage.js";
import { Segmented } from "./Designs.js";

const errText = (e: unknown) => (e instanceof Error ? e.message : "Something went wrong.");

export function BossModeCard() {
  const qc = useQueryClient();
  const [query, setQuery] = useState("");
  const { data: me } = useQuery({ queryKey: ["me"], queryFn: () => api.get<AdminMeDto>("/api/admin/me"), staleTime: 5 * 60_000 });
  const { data: c, isLoading } = useQuery({
    queryKey: ["bot-config"],
    queryFn: () => api.get<BotRuntimeConfig>("/api/admin/bot/config"),
  });
  const { data: users } = useQuery({
    queryKey: ["users"],
    queryFn: () => api.get<AdminUserDto[]>("/api/admin/users"),
    enabled: query.trim().length > 0,
  });
  const save = useMutation({
    mutationFn: (boss: BossConfig) => api.patch<BotRuntimeConfig>("/api/admin/bot/config", { boss }),
    onSuccess: (next) => qc.setQueryData(["bot-config"], next),
  });

  const canEdit = me?.role === "super";
  const boss = c?.boss;
  const update = (patch: Partial<BossConfig>) => boss && save.mutate({ ...boss, ...patch });

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase().replace(/^@/, "");
    if (!q || !users || !boss) return [];
    const linked = new Set(boss.people.map((p) => p.telegramUserId));
    return users
      .filter((u) => !u.isManual && !linked.has(u.telegramUserId))
      .filter((u) => u.displayName.toLowerCase().includes(q) || (u.username ?? "").toLowerCase().includes(q))
      .slice(0, 6);
  }, [query, users, boss]);

  return (
    <Card>
      <div style={{ display: "flex", alignItems: "center", marginBottom: 6 }}>
        <div style={{ fontSize: 15, fontWeight: 700, flex: 1 }}>Super admin in the bot</div>
        {save.isPending && <Loader size={18} />}
      </div>
      <div style={{ fontSize: 12, color: "var(--text-faint)", marginBottom: 14, lineHeight: 1.5 }}>
        The bot recognises these Telegram accounts as Jemaw's owners in every group, by account, not by name.
        {!canEdit && " Only super admins can change this."}
      </div>
      {isLoading || !boss ? (
        <SkeletonList count={4} height={36} padding={0} />
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: "var(--text-dim)" }}>Telegram accounts</span>
            {boss.people.length === 0 && (
              <span style={{ fontSize: 12.5, color: "var(--warn)" }}>None linked yet, so the bot treats everyone the same.</span>
            )}
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              {boss.people.map((p) => (
                <span
                  key={p.telegramUserId}
                  style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "5px 10px", borderRadius: 999, background: "rgba(139,92,246,.14)", fontSize: 12.5 }}
                >
                  👑 {p.name}
                  {canEdit && (
                    <button
                      aria-label={`Remove ${p.name}`}
                      disabled={save.isPending}
                      onClick={() => update({ people: boss.people.filter((x) => x.telegramUserId !== p.telegramUserId) })}
                      style={{ border: "none", background: "none", color: "var(--text-dim)", cursor: "pointer", padding: 0, fontSize: 14 }}
                    >
                      ×
                    </button>
                  )}
                </span>
              ))}
            </div>
            {canEdit && (
              <>
                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Find a Telegram account by name or @username"
                  aria-label="Find a Telegram account"
                  style={fieldStyle}
                />
                {matches.map((u) => (
                  <div key={u.telegramUserId} style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 13 }}>
                    <span style={{ flex: 1 }}>
                      {u.displayName}
                      {u.username && <span style={{ color: "var(--text-dim)" }}> @{u.username}</span>}
                    </span>
                    <GhostButton
                      disabled={save.isPending}
                      onClick={() => {
                        update({ people: [...boss.people, { telegramUserId: u.telegramUserId, name: u.displayName }] });
                        setQuery("");
                      }}
                    >
                      Make super admin
                    </GhostButton>
                  </div>
                ))}
                {query.trim() && users && matches.length === 0 && (
                  <span style={{ fontSize: 12, color: "var(--text-faint)" }}>No matching Telegram account. They need to have used Jemaw in a group.</span>
                )}
              </>
            )}
          </div>

          <Segmented
            label="How the AI talks to them"
            value={boss.tone}
            options={BOSS_TONES.map((t) => ({ key: t, label: BOSS_TONE_META[t].label }))}
            onChange={(tone) => canEdit && update({ tone })}
            hint={BOSS_TONE_META[boss.tone].hint}
          />

          <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
            <ToggleRow
              label="Never paused for them"
              hint="Their mentions don't count toward the pause, and they still get replies while Jemaw is quiet."
              on={boss.skipPause}
              disabled={!canEdit || save.isPending}
              onChange={(v) => update({ skipPause: v })}
            />
            <ToggleRow
              label="They can end a pause"
              hint={'"jemaw enough", "come back" or an apology from them ends the pause for everyone.'}
              on={boss.canEndPause}
              disabled={!canEdit || save.isPending}
              onChange={(v) => update({ canEndPause: v })}
            />
            <ToggleRow
              label="Change the books from chat"
              hint={'"settle mine to Pomi", "approve the groceries drafts", "add 600 for lunch with Aman", "delete yesterday\'s lunch". Each shows a card with Confirm and Cancel.'}
              on={boss.actions}
              disabled={!canEdit || save.isPending}
              onChange={(v) => update({ actions: v })}
            />
            <ToggleRow
              label="Chat commands"
              hint={'"jemaw humor off" and "jemaw humor on" switch the group\'s humor from the chat.'}
              on={boss.commands}
              disabled={!canEdit || save.isPending}
              onChange={(v) => update({ commands: v })}
            />
          </div>
          {save.isError && <div style={{ fontSize: 12, color: "var(--danger)" }}>{errText(save.error)}</div>}
        </div>
      )}
    </Card>
  );
}
