import { useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  useGroup,
  useAddMember,
  useRenameMember,
  useSetMemberRole,
  useSetMemberPrimary,
  useUpdateGroup,
  useResetGroup,
} from "../lib/hooks.js";
import type { MemberDto } from "@jemaw/shared/types";
import { Button } from "../ui/primitives.js";
import { MemberAvatar } from "../ui/MemberAvatar.js";
import { PageHeader } from "../ui/PageHeader.js";
import { PageLoader } from "../motion/Loader.js";
import { Modal } from "../motion/Modal.js";
import { Centered } from "./Balances.js";
import { getThemePref, setThemePref, type ThemePref } from "../lib/theme.js";

const CURRENCIES = ["EUR", "USD", "GBP", "ETB", "JPY", "CHF", "CAD", "AUD"];

export function Settings() {
  const group = useGroup();
  const addMember = useAddMember();
  const rename = useRenameMember();
  const setRole = useSetMemberRole();
  const setPrimary = useSetMemberPrimary();
  const updateGroup = useUpdateGroup();
  const resetGroup = useResetGroup();
  const nav = useNavigate();
  const [newName, setNewName] = useState("");
  const [theme, setTheme] = useState<ThemePref>(getThemePref());
  const [confirmReset, setConfirmReset] = useState(false);
  const [editMember, setEditMember] = useState<MemberDto | null>(null);

  if (group.isLoading) return <PageLoader />;
  const g = group.data;
  if (!g) return <Centered>Couldn't load settings.</Centered>;
  const isAdmin = g.isAdmin;

  async function doReset() {
    await resetGroup.mutateAsync();
    setConfirmReset(false);
    nav("/");
  }

  function pickTheme(p: ThemePref) {
    setTheme(p);
    setThemePref(p); // applies + persists immediately
  }

  return (
    <div>
      <PageHeader title="Settings" fallback="/" />
      <div style={{ padding: "0 16px 16px", display: "grid", gap: 28, minWidth: 0 }}>
      {/* Appearance */}
      <Section title="Appearance">
        <Row label="Theme">
          <Segmented
            value={theme}
            onChange={pickTheme}
            options={[
              { value: "system", label: "System" },
              { value: "light", label: "Light" },
              { value: "dark", label: "Dark" },
            ]}
          />
        </Row>
      </Section>

      {/* Group */}
      <Section title="Group">
        <Row label="Name">
          <span className="t-body-strong">{g.name}</span>
        </Row>
        <Row label="Currency">
          {g.hasExpenses || !isAdmin ? (
            <span className="t-body" style={{ color: "var(--text-muted)" }}>
              {g.defaultCurrency}
              {g.hasExpenses ? " · locked" : ""}
            </span>
          ) : (
            <select
              value={g.defaultCurrency}
              onChange={(e) =>
                updateGroup.mutate({ defaultCurrency: e.target.value })
              }
              style={selectStyle}
            >
              {CURRENCIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          )}
        </Row>
        {g.hasExpenses && (
          <p className="t-caption" style={{ color: "var(--text-faint)", margin: 0 }}>
            Currency can't change once expenses exist.
          </p>
        )}
      </Section>

      {/* Members */}
      <Section title="Members">
        <div style={{ display: "grid", gap: 4 }}>
          {g.members.map((m) => (
            <button
              key={m.id}
              onClick={() => isAdmin && setEditMember(m)}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
                minHeight: 48,
                minWidth: 0,
                width: "100%",
                padding: "6px 4px",
                background: "transparent",
                border: "none",
                textAlign: "left",
                cursor: isAdmin ? "pointer" : "default",
                color: "var(--text)",
              }}
            >
              <MemberAvatar
                name={m.displayName}
                telegramUserId={m.telegramUserId}
                size={32}
              />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div className="t-body-strong" style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {m.displayName}
                </div>
                <div className="t-caption" style={{ color: "var(--text-muted)" }}>
                  {m.role === "admin" ? "Admin" : "Member"}
                  {" · "}
                  {m.isPrimary ? "Primary" : "Secondary"}
                </div>
              </div>
              {m.role === "admin" && <Badge variant="accent">Admin</Badge>}
              {m.isPrimary && <Badge variant="positive">Primary</Badge>}
              {isAdmin && (
                <span style={{ color: "var(--text-faint)", flexShrink: 0, fontSize: 18 }}>›</span>
              )}
            </button>
          ))}
        </div>
        {isAdmin && (
          <p className="t-caption" style={{ color: "var(--text-faint)", margin: 0 }}>
            Tap a member to rename, set primary, change admin, or remove. Primary
            members are included in new splits by default.
          </p>
        )}
        <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
          <input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="Add member by name"
            style={{ ...memberInput, height: 44, flex: 1 }}
          />
          <Button
            variant="ghost"
            disabled={!newName.trim() || addMember.isPending}
            onClick={async () => {
              await addMember.mutateAsync(newName.trim());
              setNewName("");
            }}
          >
            Add
          </Button>
        </div>
      </Section>

      {/* Danger zone — admins only */}
      {isAdmin && (
        <Section title="Danger zone">
          <Row label="Reset group data">
            <Button variant="danger" onClick={() => setConfirmReset(true)}>
              Reset
            </Button>
          </Row>
          <p className="t-caption" style={{ color: "var(--text-faint)", margin: 0 }}>
            Clears all expenses, settlements, and balances for this group. Members
            are kept. This can't be undone.
          </p>
        </Section>
      )}

      <Modal open={confirmReset} onClose={() => setConfirmReset(false)}>
        <h2 className="t-heading" style={{ marginTop: 0 }}>
          Reset group data?
        </h2>
        <p className="t-body" style={{ color: "var(--text-muted)" }}>
          Every expense, settlement, and balance in this group will be permanently
          removed. Members stay. This can't be undone.
        </p>
        <div style={{ display: "flex", gap: 8, marginTop: 16 }}>
          <Button
            variant="ghost"
            onClick={() => setConfirmReset(false)}
            style={{ flex: 1 }}
          >
            Cancel
          </Button>
          <Button
            variant="danger"
            onClick={doReset}
            disabled={resetGroup.isPending}
            style={{ flex: 1 }}
          >
            {resetGroup.isPending ? "Resetting…" : "Reset"}
          </Button>
        </div>
      </Modal>

      {/* Per-member management (admins) */}
      <Modal open={!!editMember} onClose={() => setEditMember(null)}>
        {editMember && (
          <MemberEditor
            member={editMember}
            isLastAdmin={
              editMember.role === "admin" &&
              g.members.filter((x) => x.role === "admin").length <= 1
            }
            busy={rename.isPending || setRole.isPending || setPrimary.isPending}
            onRename={(name) =>
              rename.mutate({ memberId: editMember.id, displayName: name })
            }
            onTogglePrimary={() =>
              setPrimary.mutate({
                memberId: editMember.id,
                isPrimary: !editMember.isPrimary,
              })
            }
            onToggleRole={() =>
              setRole.mutate({
                memberId: editMember.id,
                role: editMember.role === "admin" ? "member" : "admin",
              })
            }
            onClose={() => setEditMember(null)}
          />
        )}
      </Modal>
      </div>
    </div>
  );
}

/** Per-member management modal: rename, primary/secondary, admin role. */
function MemberEditor({
  member,
  isLastAdmin,
  busy,
  onRename,
  onTogglePrimary,
  onToggleRole,
  onClose,
}: {
  member: MemberDto;
  isLastAdmin: boolean;
  busy: boolean;
  onRename: (name: string) => void;
  onTogglePrimary: () => void;
  onToggleRole: () => void;
  onClose: () => void;
}) {
  const [name, setName] = useState(member.displayName);
  return (
    <div style={{ display: "grid", gap: 16 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <MemberAvatar name={member.displayName} telegramUserId={member.telegramUserId} size={44} />
        <h2 className="t-heading" style={{ margin: 0 }}>{member.displayName}</h2>
      </div>

      {/* rename */}
      <div style={{ display: "grid", gap: 6 }}>
        <span className="t-mono-label" style={{ color: "var(--text-muted)" }}>Name</span>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          style={{ ...memberInput, height: 44 }}
        />
      </div>

      {/* primary toggle */}
      <ToggleRow
        label="Primary member"
        hint="Included in new expense splits by default."
        on={member.isPrimary}
        onClick={onTogglePrimary}
        disabled={busy}
      />

      {/* admin toggle */}
      <ToggleRow
        label="Group admin"
        hint={
          isLastAdmin
            ? "A group must keep at least one admin."
            : "Admins can edit, remove, and manage members."
        }
        on={member.role === "admin"}
        onClick={onToggleRole}
        disabled={busy || isLastAdmin}
      />

      <div style={{ display: "flex", gap: 8, marginTop: 4 }}>
        <Button variant="ghost" onClick={onClose} style={{ flex: 1 }}>
          Close
        </Button>
        <Button
          onClick={() => {
            const v = name.trim();
            if (v && v !== member.displayName) onRename(v);
            onClose();
          }}
          disabled={busy}
          style={{ flex: 1 }}
        >
          Save
        </Button>
      </div>
    </div>
  );
}

function ToggleRow({
  label,
  hint,
  on,
  onClick,
  disabled,
}: {
  label: string;
  hint: string;
  on: boolean;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div className="t-body-strong">{label}</div>
        <div className="t-caption" style={{ color: "var(--text-faint)" }}>{hint}</div>
      </div>
      <button
        role="switch"
        aria-checked={on}
        onClick={onClick}
        disabled={disabled}
        style={{
          flexShrink: 0,
          width: 46,
          height: 28,
          borderRadius: 999,
          border: "none",
          padding: 3,
          cursor: disabled ? "not-allowed" : "pointer",
          opacity: disabled ? 0.5 : 1,
          background: on ? "var(--accent)" : "var(--surface-3)",
          transition: "background var(--dur-fast)",
          display: "flex",
          justifyContent: on ? "flex-end" : "flex-start",
        }}
      >
        <span
          style={{
            width: 22,
            height: 22,
            borderRadius: "50%",
            background: "#fff",
            transition: "all var(--dur-fast)",
          }}
        />
      </button>
    </div>
  );
}

function Badge({ children, variant }: { children: React.ReactNode; variant: "accent" | "positive" }) {
  const color = variant === "positive" ? "var(--positive)" : "var(--accent)";
  const soft = variant === "positive" ? "var(--positive-soft)" : "var(--accent-soft)";
  return (
    <span
      className="t-caption"
      style={{
        flexShrink: 0,
        padding: "2px 8px",
        borderRadius: "var(--r-full)",
        background: soft,
        color,
        fontWeight: 700,
        fontSize: 10,
        textTransform: "uppercase",
        letterSpacing: "0.04em",
      }}
    >
      {children}
    </span>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section style={{ display: "grid", gap: 10 }}>
      <h2 className="t-mono-label" style={{ color: "var(--text-muted)", margin: 0 }}>
        {title}
      </h2>
      <div
        style={{
          background: "var(--surface)",
          border: "1px solid var(--border)",
          borderRadius: "var(--r-lg)",
          padding: 16,
          display: "grid",
          gap: 12,
          minWidth: 0,
        }}
      >
        {children}
      </div>
    </section>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div
      style={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        gap: 12,
        minHeight: 36,
      }}
    >
      <span className="t-body" style={{ color: "var(--text-muted)" }}>
        {label}
      </span>
      {children}
    </div>
  );
}

function Segmented<T extends string>({
  value,
  onChange,
  options,
}: {
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: string }[];
}) {
  return (
    <div
      style={{
        display: "flex",
        background: "var(--bg)",
        border: "1px solid var(--border)",
        borderRadius: "var(--r-md)",
        padding: 3,
        gap: 3,
      }}
    >
      {options.map((o) => (
        <button
          key={o.value}
          onClick={() => onChange(o.value)}
          className="t-label"
          style={{
            height: 30,
            padding: "0 12px",
            borderRadius: "var(--r-sm)",
            border: "none",
            cursor: "pointer",
            fontWeight: value === o.value ? 600 : 500,
            background: value === o.value ? "var(--accent)" : "transparent",
            color: value === o.value ? "#fff" : "var(--text-muted)",
            transition: "background var(--dur-fast), color var(--dur-fast)",
          }}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

const selectStyle: React.CSSProperties = {
  height: 36,
  padding: "0 10px",
  borderRadius: "var(--r-md)",
  border: "1px solid var(--border-strong)",
  background: "var(--surface)",
  color: "var(--text)",
  fontSize: 15,
  fontFamily: "inherit",
};

const memberInput: React.CSSProperties = {
  flex: 1,
  height: 36,
  padding: "0 10px",
  border: "1px solid var(--border)",
  borderRadius: "var(--r-md)",
  background: "transparent",
  color: "var(--text)",
  fontSize: 16,
  fontFamily: "inherit",
};
