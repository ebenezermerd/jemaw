import { useState } from "react";
import {
  useGroup,
  useAddMember,
  useRenameMember,
  useUpdateGroup,
} from "../lib/hooks.js";
import { Button } from "../ui/primitives.js";
import { MemberAvatar } from "../ui/MemberAvatar.js";
import { PageHeader } from "../ui/PageHeader.js";
import { PageLoader } from "../motion/Loader.js";
import { Centered } from "./Balances.js";
import { getThemePref, setThemePref, type ThemePref } from "../lib/theme.js";

const CURRENCIES = ["EUR", "USD", "GBP", "ETB", "JPY", "CHF", "CAD", "AUD"];

export function Settings() {
  const group = useGroup();
  const addMember = useAddMember();
  const rename = useRenameMember();
  const updateGroup = useUpdateGroup();
  const [newName, setNewName] = useState("");
  const [theme, setTheme] = useState<ThemePref>(getThemePref());

  if (group.isLoading) return <PageLoader />;
  const g = group.data;
  if (!g) return <Centered>Couldn't load settings.</Centered>;

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
          {g.hasExpenses ? (
            <span className="t-body" style={{ color: "var(--text-muted)" }}>
              {g.defaultCurrency} · locked
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
