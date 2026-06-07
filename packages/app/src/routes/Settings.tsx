import { useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  useGroup,
  useAddMember,
  useRenameMember,
  useUpdateGroup,
  useResetGroup,
} from "../lib/hooks.js";
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
  const updateGroup = useUpdateGroup();
  const resetGroup = useResetGroup();
  const nav = useNavigate();
  const [newName, setNewName] = useState("");
  const [theme, setTheme] = useState<ThemePref>(getThemePref());
  const [confirmReset, setConfirmReset] = useState(false);

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
      <div style={{ padding: "0 16px 16px", display: "grid", gap: 28 }}>
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
            <div
              key={m.id}
              style={{ display: "flex", alignItems: "center", gap: 10, height: 48 }}
            >
              <MemberAvatar
                name={m.displayName}
                telegramUserId={m.telegramUserId}
                size={28}
              />
              <input
                defaultValue={m.displayName}
                onBlur={(e) => {
                  const v = e.target.value.trim();
                  if (v && v !== m.displayName)
                    rename.mutate({ memberId: m.id, displayName: v });
                }}
                style={memberInput}
              />
            </div>
          ))}
        </div>
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
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section style={{ display: "grid", gap: 10 }}>
      <h2 className="t-label" style={{ color: "var(--text-muted)", margin: 0, textTransform: "uppercase", letterSpacing: "0.04em" }}>
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
            background: value === o.value ? "var(--accent-soft)" : "transparent",
            color: value === o.value ? "var(--accent)" : "var(--text-muted)",
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
