import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useGroup, useCreateExpense } from "../lib/hooks.js";
import type { SplitType, CreateExpenseInput } from "@jemaw/shared/types";
import { decimalToCents, centsToDecimal } from "@jemaw/shared/types";
import { Button, Avatar } from "../ui/primitives.js";
import { Centered } from "./Balances.js";

export function Add() {
  const group = useGroup();
  const create = useCreateExpense();
  const nav = useNavigate();

  const members = group.data?.members.filter((m) => m.isActive) ?? [];

  const [description, setDescription] = useState("");
  const [amount, setAmount] = useState("");
  const [payer, setPayer] = useState<string>("");
  const [splitType, setSplitType] = useState<SplitType>("equal");
  const [splitWith, setSplitWith] = useState<Set<string>>(new Set());
  const [shares, setShares] = useState<Record<string, number>>({});
  const [exact, setExact] = useState<Record<string, string>>({});

  // Default selections once members load.
  useEffect(() => {
    if (members.length && !payer) setPayer(members[0]!.id);
    if (members.length && splitWith.size === 0)
      setSplitWith(new Set(members.map((m) => m.id)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [group.data]);

  if (group.isLoading) return <Centered>Loading…</Centered>;
  if (members.length === 0)
    return <Centered>Add members before adding an expense.</Centered>;

  const totalCents = amount && /^\d+(\.\d{1,2})?$/.test(amount)
    ? decimalToCents(amount)
    : 0;
  const participants = [...splitWith];

  const exactSum = participants.reduce(
    (s, id) => s + (exact[id] && /^\d+(\.\d{1,2})?$/.test(exact[id]!) ? decimalToCents(exact[id]!) : 0),
    0,
  );
  const exactRemainder = totalCents - exactSum;

  const valid =
    description.trim().length > 0 &&
    totalCents > 0 &&
    payer &&
    participants.length > 0 &&
    (splitType !== "shares" ||
      participants.every((id) => (shares[id] ?? 0) > 0)) &&
    (splitType !== "exact" || exactRemainder === 0);

  function toggle(id: string) {
    const next = new Set(splitWith);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSplitWith(next);
  }

  async function submit() {
    const input: CreateExpenseInput = {
      description: description.trim(),
      amount,
      payerMemberId: payer,
      splitType,
      splitWith: participants,
      shares: splitType === "shares" ? shares : undefined,
      exact: splitType === "exact" ? exact : undefined,
    };
    await create.mutateAsync(input);
    nav("/balances");
  }

  return (
    <div style={{ padding: 16, display: "grid", gap: 20 }}>
      <h1 className="t-title" style={{ margin: "8px 0 0" }}>
        Add expense
      </h1>

      <Field label="Description">
        <input
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Dinner at Trattoria"
          style={inputStyle}
        />
      </Field>

      <Field label="Amount">
        <input
          value={amount}
          onChange={(e) => setAmount(e.target.value.replace(/[^\d.]/g, ""))}
          inputMode="decimal"
          placeholder="0.00"
          className="tnum t-display"
          style={{ ...inputStyle, fontVariantNumeric: "tabular-nums" }}
        />
      </Field>

      <Field label="Paid by">
        <ChipRow>
          {members.map((m) => (
            <Chip
              key={m.id}
              active={payer === m.id}
              onClick={() => setPayer(m.id)}
              name={m.displayName}
            />
          ))}
        </ChipRow>
      </Field>

      <Field label="Split">
        <Segmented
          value={splitType}
          onChange={setSplitType}
          options={["equal", "shares", "exact"]}
        />
      </Field>

      <Field label="Split between">
        <div style={{ display: "grid", gap: 8 }}>
          {members.map((m) => {
            const on = splitWith.has(m.id);
            return (
              <div
                key={m.id}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 12,
                  padding: "8px 12px",
                  borderRadius: "var(--r-md)",
                  border: on
                    ? "1px solid var(--accent)"
                    : "1px solid var(--border)",
                  background: on ? "var(--accent-soft)" : "transparent",
                }}
              >
                <button
                  onClick={() => toggle(m.id)}
                  style={{
                    flex: 1,
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                    border: "none",
                    background: "transparent",
                    color: "var(--text)",
                    cursor: "pointer",
                  }}
                >
                  <Avatar name={m.displayName} size={28} />
                  <span className="t-body-strong">{m.displayName}</span>
                </button>

                {on && splitType === "shares" && (
                  <Stepper
                    value={shares[m.id] ?? 1}
                    onChange={(v) => setShares({ ...shares, [m.id]: v })}
                  />
                )}
                {on && splitType === "exact" && (
                  <input
                    value={exact[m.id] ?? ""}
                    onChange={(e) =>
                      setExact({
                        ...exact,
                        [m.id]: e.target.value.replace(/[^\d.]/g, ""),
                      })
                    }
                    inputMode="decimal"
                    placeholder="0.00"
                    className="tnum"
                    style={{ ...inputStyle, width: 90, height: 36, textAlign: "right" }}
                  />
                )}
              </div>
            );
          })}
        </div>

        {splitType === "exact" && (
          <p
            className="t-caption"
            style={{
              marginTop: 8,
              color: exactRemainder === 0 ? "var(--accent)" : "var(--warn)",
            }}
          >
            {exactRemainder === 0
              ? "Balanced."
              : `Remainder: ${centsToDecimal(exactRemainder)}`}
          </p>
        )}
      </Field>

      <Button disabled={!valid || create.isPending} onClick={submit}>
        {create.isPending ? "Adding…" : "Add"}
      </Button>
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  width: "100%",
  height: 44,
  padding: "0 12px",
  borderRadius: "var(--r-md)",
  border: "1px solid var(--border-strong)",
  background: "var(--surface)",
  color: "var(--text)",
  fontSize: 16,
  fontFamily: "inherit",
};

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label style={{ display: "grid", gap: 8 }}>
      <span className="t-label" style={{ color: "var(--text-muted)" }}>
        {label}
      </span>
      {children}
    </label>
  );
}

function ChipRow({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ display: "flex", gap: 8, overflowX: "auto", paddingBottom: 4 }}>
      {children}
    </div>
  );
}

function Chip({
  active,
  onClick,
  name,
}: {
  active: boolean;
  onClick: () => void;
  name: string;
}) {
  return (
    <button
      onClick={onClick}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 8,
        height: 40,
        padding: "0 12px 0 8px",
        flexShrink: 0,
        borderRadius: "var(--r-full)",
        border: active ? "1px solid var(--accent)" : "1px solid var(--border-strong)",
        background: active ? "var(--accent-soft)" : "transparent",
        color: "var(--text)",
        cursor: "pointer",
      }}
    >
      <Avatar name={name} size={24} />
      <span className="t-label">{name}</span>
    </button>
  );
}

function Segmented({
  value,
  onChange,
  options,
}: {
  value: SplitType;
  onChange: (v: SplitType) => void;
  options: SplitType[];
}) {
  return (
    <div
      style={{
        display: "flex",
        background: "var(--surface)",
        border: "1px solid var(--border)",
        borderRadius: "var(--r-md)",
        padding: 4,
        gap: 4,
      }}
    >
      {options.map((o) => (
        <button
          key={o}
          onClick={() => onChange(o)}
          className="t-label"
          style={{
            flex: 1,
            height: 36,
            borderRadius: "var(--r-sm)",
            border: "none",
            textTransform: "capitalize",
            background: value === o ? "var(--accent-soft)" : "transparent",
            color: value === o ? "var(--accent)" : "var(--text-muted)",
            cursor: "pointer",
          }}
        >
          {o}
        </button>
      ))}
    </div>
  );
}

function Stepper({
  value,
  onChange,
}: {
  value: number;
  onChange: (v: number) => void;
}) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
      <StepBtn onClick={() => onChange(Math.max(1, value - 1))}>−</StepBtn>
      <span className="tnum t-body-strong" style={{ minWidth: 16, textAlign: "center" }}>
        {value}
      </span>
      <StepBtn onClick={() => onChange(value + 1)}>+</StepBtn>
    </div>
  );
}

function StepBtn({ children, onClick }: { children: React.ReactNode; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      style={{
        width: 32,
        height: 32,
        borderRadius: "var(--r-full)",
        border: "1px solid var(--border-strong)",
        background: "transparent",
        color: "var(--text)",
        cursor: "pointer",
        fontSize: 18,
        lineHeight: 1,
      }}
    >
      {children}
    </button>
  );
}
