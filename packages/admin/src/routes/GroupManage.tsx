/**
 * Group management widgets for the group detail page: edit name and currency,
 * the group's bot and AI settings, member actions, and the danger zone.
 */
import { useState, type ReactNode } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { api } from "../lib/api.js";
import type {
  AdminGroupDetailDto,
  AdminGroupMemberDto,
  DeleteGroupResultDto,
  HumorSettingsDto,
  UpdateGroupInput,
  UpdateGroupResultDto,
  UpdateMemberInput,
} from "@jemaw/shared/types";
import { Dialog, GhostButton, fieldStyle } from "../ui/Dialog.js";
import { Loader } from "../ui/Loader.js";
import { PrimaryButton } from "../ui/primitives.js";

const errText = (e: unknown) => (e instanceof Error ? e.message : "Something went wrong.");

function useInvalidateGroup(groupId: string) {
  const qc = useQueryClient();
  return () => {
    void qc.invalidateQueries({ queryKey: ["group", groupId] });
    void qc.invalidateQueries({ queryKey: ["groups"] });
    void qc.invalidateQueries({ queryKey: ["users"] });
    void qc.invalidateQueries({ queryKey: ["user"] });
    void qc.invalidateQueries({ queryKey: ["activity"] });
  };
}

// ─── edit name / currency ────────────────────────────────────────────────────

export function EditGroupDialog({ detail, onClose }: { detail: AdminGroupDetailDto; onClose: () => void }) {
  const { group, settings } = detail;
  const [name, setName] = useState(group.name);
  const [currency, setCurrency] = useState(group.defaultCurrency);
  const [note, setNote] = useState<string | null>(null);
  const invalidate = useInvalidateGroup(group.id);
  const save = useMutation({
    mutationFn: (input: UpdateGroupInput) => api.patch<UpdateGroupResultDto>(`/api/admin/groups/${group.id}`, input),
    onSuccess: (res) => {
      invalidate();
      if (res.telegramSynced === false) {
        setNote("Saved. Telegram refused the rename (the bot needs admin rights there), so the chat keeps its old title.");
        return;
      }
      onClose();
    },
  });
  const input: UpdateGroupInput = {};
  if (name.trim() && name.trim() !== group.name) input.name = name.trim();
  if (currency.trim().toUpperCase() !== group.defaultCurrency) input.defaultCurrency = currency.trim().toUpperCase();
  const valid = name.trim().length > 0 && /^[A-Za-z]{3}$/.test(currency.trim());
  return (
    <Dialog
      title="Edit group"
      subtitle="Renaming also updates the Telegram chat title when the bot is an admin there."
      onClose={onClose}
      footer={
        <>
          <GhostButton onClick={onClose}>{note ? "Close" : "Cancel"}</GhostButton>
          <PrimaryButton onClick={() => save.mutate(input)} disabled={!valid || Object.keys(input).length === 0 || save.isPending}>
            {save.isPending ? "Saving…" : "Save changes"}
          </PrimaryButton>
        </>
      }
    >
      <Field label="Name">
        <input value={name} maxLength={80} onChange={(e) => setName(e.target.value)} style={fieldStyle} />
      </Field>
      <Field
        label="Currency"
        hint={settings.currencyLocked ? "Locked: this group already has expenses in this currency." : "Three-letter code, e.g. ETB or USD."}
      >
        <input
          value={currency}
          maxLength={3}
          disabled={settings.currencyLocked}
          onChange={(e) => setCurrency(e.target.value.toUpperCase())}
          style={{ ...fieldStyle, opacity: settings.currencyLocked ? 0.5 : 1, fontFamily: "var(--font-mono)" }}
        />
      </Field>
      {save.isError && <ErrorLine>{errText(save.error)}</ErrorLine>}
      {note && <div style={{ fontSize: 12.5, color: "var(--warn)" }}>{note}</div>}
    </Dialog>
  );
}

// ─── bot & AI settings for one group ─────────────────────────────────────────

const MODES: { key: HumorSettingsDto["mode"]; label: string; hint: string }[] = [
  { key: "off", label: "Off", hint: "Facts only, no banter" },
  { key: "jemaw_dry", label: "Dry", hint: "Light, deadpan" },
  { key: "roast", label: "Roast", hint: "Friendly roasts" },
  { key: "chaos", label: "Chaos", hint: "Loud and frequent" },
];

const TOGGLES: { key: keyof HumorSettingsDto; label: string; hint: string }[] = [
  { key: "publicRepliesEnabled", label: "Public replies", hint: "Jemaw may reply in the group chat" },
  { key: "useModelComposer", label: "AI-written replies", hint: "Use the model before falling back to templates" },
  { key: "ledgerBanter", label: "Brag & roast with real numbers", hint: "Lets replies mention balances" },
  { key: "useGroupVibe", label: "Match the group's vibe", hint: "Tone learned from recent chat" },
  { key: "usePreferenceLearning", label: "Learn from reactions", hint: "Feedback tunes future replies" },
  { key: "latePaymentHumor", label: "Late-payment jokes", hint: "" },
  { key: "publicFinancialRoasting", label: "Roast spending in public", hint: "" },
];

export function GroupBotCard({ detail }: { detail: AdminGroupDetailDto }) {
  const groupId = detail.group.id;
  const h = detail.settings.humor;
  const invalidate = useInvalidateGroup(groupId);
  const [pending, setPending] = useState<string | null>(null);
  const patch = useMutation({
    mutationFn: (body: Record<string, unknown>) => api.patch<HumorSettingsDto>(`/api/admin/groups/${groupId}/humor`, body),
    onSettled: () => setPending(null),
    onSuccess: invalidate,
  });
  const send = (key: string, body: Record<string, unknown>) => {
    setPending(key);
    patch.mutate(body);
  };
  const muted = h.mutedUntil && Date.parse(h.mutedUntil) > Date.now();
  return (
    <div style={{ background: "#16151F", border: "1px solid rgba(255,255,255,.07)", borderRadius: 16, overflow: "hidden" }}>
      <div style={{ padding: "15px 20px", borderBottom: "1px solid rgba(255,255,255,.07)", display: "flex", alignItems: "center", gap: 10 }}>
        <span style={{ fontSize: 15, fontWeight: 700, flex: 1 }}>Bot &amp; AI in this group</span>
        {patch.isPending && <Loader size={18} />}
      </div>
      <div style={{ padding: 20, display: "flex", flexDirection: "column", gap: 18 }}>
        <div>
          <Label>Personality</Label>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 8 }}>
            {MODES.map((m) => {
              const on = h.mode === m.key;
              return (
                <button
                  key={m.key}
                  onClick={() => !on && send("mode", { mode: m.key })}
                  disabled={patch.isPending}
                  style={{
                    textAlign: "left",
                    padding: "10px 12px",
                    borderRadius: 11,
                    cursor: on ? "default" : "pointer",
                    background: on ? "rgba(110,89,199,.22)" : "var(--bg-panel)",
                    border: `1px solid ${on ? "rgba(169,156,227,.6)" : "var(--hairline-2)"}`,
                    color: "var(--text)",
                  }}
                >
                  <div style={{ fontSize: 13, fontWeight: 700 }}>{m.label}</div>
                  <div style={{ fontSize: 11, color: "var(--text-dim)", marginTop: 2 }}>{m.hint}</div>
                </button>
              );
            })}
          </div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "4px 18px" }}>
          {TOGGLES.map((t) => (
            <ToggleRow
              key={t.key}
              label={t.label}
              hint={t.hint}
              on={Boolean(h[t.key])}
              busy={pending === t.key}
              disabled={patch.isPending}
              onChange={(v) => send(t.key, { [t.key]: v })}
            />
          ))}
        </div>

        <div style={{ display: "flex", gap: 14, flexWrap: "wrap", alignItems: "flex-end" }}>
          <NumberField
            label="Max public replies / day"
            value={h.maxPublicRepliesPerDay}
            min={0}
            max={100}
            disabled={patch.isPending}
            onCommit={(n) => send("max", { maxPublicRepliesPerDay: n })}
          />
          <NumberField
            label="Cooldown (minutes)"
            value={h.cooldownMinutes}
            min={0}
            max={1440}
            disabled={patch.isPending}
            onCommit={(n) => send("cooldown", { cooldownMinutes: n })}
          />
          <div style={{ flex: 1 }} />
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span style={{ fontSize: 12.5, color: muted ? "var(--warn)" : "var(--text-dim)" }}>
              {muted ? `Muted until ${new Date(h.mutedUntil!).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}` : "Not muted"}
            </span>
            {muted ? (
              <GhostButton onClick={() => send("mute", { muteDays: 0 })} disabled={patch.isPending}>
                Unmute
              </GhostButton>
            ) : (
              <>
                <GhostButton onClick={() => send("mute", { muteDays: 1 })} disabled={patch.isPending}>
                  Mute 1 day
                </GhostButton>
                <GhostButton onClick={() => send("mute", { muteDays: 7 })} disabled={patch.isPending}>
                  Mute 7 days
                </GhostButton>
              </>
            )}
          </div>
        </div>
        {patch.isError && <ErrorLine>{errText(patch.error)}</ErrorLine>}
      </div>
    </div>
  );
}

// ─── member actions ──────────────────────────────────────────────────────────

export function MemberActions({ groupId, member }: { groupId: string; member: AdminGroupMemberDto }) {
  const [open, setOpen] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const invalidate = useInvalidateGroup(groupId);
  const update = useMutation({
    mutationFn: (input: UpdateMemberInput) => api.patch(`/api/admin/groups/${groupId}/members/${member.memberId}`, input),
    onSuccess: () => {
      setOpen(false);
      setRenaming(false);
      invalidate();
    },
  });
  const item = (label: string, input: UpdateMemberInput, tone?: "danger") => (
    <button
      key={label}
      onClick={() => update.mutate(input)}
      disabled={update.isPending}
      style={{ ...menuItem, color: tone === "danger" ? "var(--danger)" : "var(--text)" }}
    >
      {label}
    </button>
  );
  return (
    <div style={{ position: "relative" }} onClick={(e) => e.stopPropagation()}>
      <button
        aria-label={`Actions for ${member.displayName}`}
        onClick={() => setOpen((o) => !o)}
        style={{ background: "transparent", border: "none", cursor: "pointer", padding: 4, borderRadius: 7, color: "rgba(244,242,251,.5)", display: "flex" }}
      >
        {update.isPending ? (
          <Loader size={18} />
        ) : (
          <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor">
            <circle cx="5" cy="12" r="1.6" />
            <circle cx="12" cy="12" r="1.6" />
            <circle cx="19" cy="12" r="1.6" />
          </svg>
        )}
      </button>
      {open && (
        <>
          <div onClick={() => setOpen(false)} style={{ position: "fixed", inset: 0, zIndex: 50 }} />
          <div style={{ position: "absolute", right: 0, top: "calc(100% + 4px)", zIndex: 51, minWidth: 190, background: "#1E1C2A", border: "1px solid rgba(255,255,255,.1)", borderRadius: 12, padding: 6, boxShadow: "0 16px 40px -12px rgba(0,0,0,.6)" }}>
            {member.role === "admin" ? item("Make member", { role: "member" }) : item("Make group admin", { role: "admin" })}
            <button onClick={() => { setRenaming(true); setOpen(false); }} style={menuItem}>
              Rename in this group
            </button>
            {member.isActive ? item("Remove from group", { isActive: false }, "danger") : item("Restore to group", { isActive: true })}
            {update.isError && <div style={{ fontSize: 12, color: "var(--danger)", padding: "6px 10px" }}>{errText(update.error)}</div>}
          </div>
        </>
      )}
      {renaming && <RenameMemberDialog member={member} pending={update.isPending} error={update.isError ? errText(update.error) : null} onSave={(displayName) => update.mutate({ displayName })} onClose={() => setRenaming(false)} />}
    </div>
  );
}

function RenameMemberDialog({ member, pending, error, onSave, onClose }: { member: AdminGroupMemberDto; pending: boolean; error: string | null; onSave: (name: string) => void; onClose: () => void }) {
  const [name, setName] = useState(member.displayName);
  return (
    <Dialog
      title="Rename member"
      subtitle="Only changes how they appear in this group."
      onClose={onClose}
      footer={
        <>
          <GhostButton onClick={onClose}>Cancel</GhostButton>
          <PrimaryButton onClick={() => onSave(name.trim())} disabled={!name.trim() || name.trim() === member.displayName || pending}>
            {pending ? "Saving…" : "Save"}
          </PrimaryButton>
        </>
      }
    >
      <input value={name} maxLength={60} onChange={(e) => setName(e.target.value)} style={fieldStyle} autoFocus />
      {error && <ErrorLine>{error}</ErrorLine>}
    </Dialog>
  );
}

// ─── danger zone ─────────────────────────────────────────────────────────────

export function DangerZone({ detail }: { detail: AdminGroupDetailDto }) {
  const [dialog, setDialog] = useState<"reset" | "delete" | null>(null);
  return (
    <div style={{ background: "#16151F", border: "1px solid rgba(242,104,95,.25)", borderRadius: 16, padding: 20 }}>
      <div style={{ fontSize: 15, fontWeight: 700, color: "var(--danger)", marginBottom: 14 }}>Danger zone</div>
      <DangerRow
        title="Reset ledger"
        text="Deletes every expense, settlement, draft and AI scan. Members and settings stay."
        action={<GhostButton tone="danger" onClick={() => setDialog("reset")}>Reset ledger</GhostButton>}
      />
      <div style={{ height: 1, background: "rgba(255,255,255,.06)", margin: "14px 0" }} />
      <DangerRow
        title="Delete group"
        text="Removes the group and all its data for good, and the bot leaves the Telegram chat."
        action={<GhostButton tone="danger" onClick={() => setDialog("delete")}>Delete group</GhostButton>}
      />
      {dialog && <ConfirmDangerDialog detail={detail} kind={dialog} onClose={() => setDialog(null)} />}
    </div>
  );
}

function ConfirmDangerDialog({ detail, kind, onClose }: { detail: AdminGroupDetailDto; kind: "reset" | "delete"; onClose: () => void }) {
  const { group } = detail;
  const [typed, setTyped] = useState("");
  const navigate = useNavigate();
  const qc = useQueryClient();
  const invalidate = useInvalidateGroup(group.id);
  const run = useMutation({
    mutationFn: () =>
      kind === "delete"
        ? api.delete<DeleteGroupResultDto>(`/api/admin/groups/${group.id}`, { confirmName: typed })
        : api.post<{ deleted: Record<string, number> }>(`/api/admin/groups/${group.id}/reset`),
    onSuccess: () => {
      invalidate();
      void qc.invalidateQueries({ queryKey: ["expenses"] });
      onClose();
      if (kind === "delete") {
        qc.removeQueries({ queryKey: ["group", group.id] });
        navigate("/groups");
      }
    },
  });
  const matches = typed.trim() === group.name.trim();
  return (
    <Dialog
      tone="danger"
      title={kind === "delete" ? `Delete ${group.name}?` : `Reset ${group.name}'s ledger?`}
      subtitle="This cannot be undone."
      onClose={onClose}
      footer={
        <>
          <GhostButton onClick={onClose}>Cancel</GhostButton>
          <GhostButton tone="danger" onClick={() => run.mutate()} disabled={!matches || run.isPending}>
            {run.isPending ? "Working…" : kind === "delete" ? "Delete forever" : "Reset ledger"}
          </GhostButton>
        </>
      }
    >
      <div style={{ fontSize: 13.5, color: "var(--text-dim)", lineHeight: 1.55 }}>
        {kind === "delete"
          ? `${group.memberCount} members, ${group.expenseCount} expenses and every settlement, draft and bot reply in this group will be deleted, and Jemaw will leave the chat.`
          : `${group.expenseCount} expenses and every settlement, draft and AI scan will be deleted. Balances go back to zero.`}
      </div>
      <Field label={`Type ${group.name} to confirm`}>
        <input value={typed} onChange={(e) => setTyped(e.target.value)} style={fieldStyle} autoFocus />
      </Field>
      {run.isError && <ErrorLine>{errText(run.error)}</ErrorLine>}
    </Dialog>
  );
}

// ─── small bits ──────────────────────────────────────────────────────────────

const menuItem = {
  display: "block",
  width: "100%",
  textAlign: "left",
  background: "transparent",
  border: "none",
  padding: "8px 10px",
  borderRadius: 8,
  fontSize: 13,
  cursor: "pointer",
  color: "var(--text)",
} as const;

function DangerRow({ title, text, action }: { title: string; text: string; action: ReactNode }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 14, fontWeight: 600 }}>{title}</div>
        <div style={{ fontSize: 12.5, color: "var(--text-dim)", marginTop: 2 }}>{text}</div>
      </div>
      {action}
    </div>
  );
}

function Label({ children }: { children: ReactNode }) {
  return <div style={{ fontSize: 12, fontWeight: 600, color: "var(--text-dim)", marginBottom: 8 }}>{children}</div>;
}

function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <span style={{ fontSize: 12, fontWeight: 600, color: "var(--text-dim)" }}>{label}</span>
      {children}
      {hint && <span style={{ fontSize: 11.5, color: "var(--text-faint)" }}>{hint}</span>}
    </label>
  );
}

function ErrorLine({ children }: { children: ReactNode }) {
  return <div style={{ fontSize: 12.5, color: "var(--danger)" }}>{children}</div>;
}

export function ToggleRow({
  label,
  hint,
  on,
  onChange,
  busy = false,
  disabled = false,
}: {
  label: string;
  hint?: string;
  on: boolean;
  onChange: (v: boolean) => void;
  busy?: boolean;
  disabled?: boolean;
}) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "8px 0" }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13.5, fontWeight: 600 }}>{label}</div>
        {hint && <div style={{ fontSize: 11.5, color: "var(--text-faint)", marginTop: 1 }}>{hint}</div>}
      </div>
      {busy && <Loader size={16} />}
      <button
        role="switch"
        aria-checked={on}
        aria-label={label}
        disabled={disabled}
        onClick={() => onChange(!on)}
        style={{
          width: 40,
          height: 23,
          borderRadius: 999,
          border: "none",
          padding: 3,
          cursor: disabled ? "default" : "pointer",
          background: on ? "var(--accent)" : "#2a2838",
          display: "flex",
          justifyContent: on ? "flex-end" : "flex-start",
          transition: "background .15s",
          flex: "none",
          opacity: disabled && !busy ? 0.7 : 1,
        }}
      >
        <span style={{ width: 17, height: 17, borderRadius: "50%", background: "#fff" }} />
      </button>
    </div>
  );
}

export function NumberField({
  label,
  value,
  min,
  max,
  onCommit,
  disabled,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  onCommit: (n: number) => void;
  disabled?: boolean;
}) {
  const [draft, setDraft] = useState(String(value));
  const [seen, setSeen] = useState(value);
  if (seen !== value) {
    setSeen(value);
    setDraft(String(value));
  }
  const commit = () => {
    const n = Math.min(max, Math.max(min, Math.round(Number(draft))));
    if (Number.isFinite(n) && n !== value) onCommit(n);
    else setDraft(String(value));
  };
  return (
    <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <span style={{ fontSize: 12, fontWeight: 600, color: "var(--text-dim)" }}>{label}</span>
      <input
        type="number"
        min={min}
        max={max}
        value={draft}
        disabled={disabled}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => e.key === "Enter" && commit()}
        style={{ ...fieldStyle, width: 150, fontFamily: "var(--font-mono)" }}
      />
    </label>
  );
}
