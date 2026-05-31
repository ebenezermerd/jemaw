import { useState } from "react";
import { useGroup, useAddMember, useRenameMember } from "../lib/hooks.js";
import { Button, Avatar } from "../ui/primitives.js";
import { Centered } from "./Balances.js";

export function Settings() {
  const group = useGroup();
  const addMember = useAddMember();
  const rename = useRenameMember();
  const [newName, setNewName] = useState("");

  if (group.isLoading) return <Centered>Loading…</Centered>;
  const g = group.data;
  if (!g) return <Centered>Couldn't load settings.</Centered>;

  return (
    <div style={{ padding: 16, display: "grid", gap: 24 }}>
      <h1 className="t-title" style={{ margin: "8px 0 0" }}>
        Settings
      </h1>

      <section style={{ display: "grid", gap: 8 }}>
        <h2 className="t-heading">Group</h2>
        <Row label="Name" value={g.name} />
        <Row
          label="Currency"
          value={
            g.hasExpenses
              ? `${g.defaultCurrency} (locked — expenses exist)`
              : g.defaultCurrency
          }
        />
      </section>

      <section style={{ display: "grid", gap: 8 }}>
        <h2 className="t-heading">Members</h2>
        {g.members.map((m) => (
          <div
            key={m.id}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              height: 48,
            }}
          >
            <Avatar name={m.displayName} size={28} />
            <input
              defaultValue={m.displayName}
              onBlur={(e) => {
                const v = e.target.value.trim();
                if (v && v !== m.displayName)
                  rename.mutate({ memberId: m.id, displayName: v });
              }}
              style={{
                flex: 1,
                height: 36,
                padding: "0 10px",
                border: "1px solid var(--border)",
                borderRadius: "var(--r-md)",
                background: "transparent",
                color: "var(--text)",
                fontSize: 16,
                fontFamily: "inherit",
              }}
            />
          </div>
        ))}

        <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
          <input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="Add member by name"
            style={{
              flex: 1,
              height: 44,
              padding: "0 12px",
              border: "1px solid var(--border-strong)",
              borderRadius: "var(--r-md)",
              background: "var(--surface)",
              color: "var(--text)",
              fontSize: 16,
              fontFamily: "inherit",
            }}
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
      </section>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div
      style={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        height: 48,
      }}
    >
      <span className="t-body" style={{ color: "var(--text-muted)" }}>
        {label}
      </span>
      <span className="t-body-strong">{value}</span>
    </div>
  );
}
