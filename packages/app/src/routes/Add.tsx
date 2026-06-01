import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import {
  useGroup,
  useCreateExpense,
  useSuggestions,
  useEditSuggestion,
} from "../lib/hooks.js";
import type { SplitType, CreateExpenseInput } from "@jemaw/shared/types";
import { decimalToCents, centsToDecimal } from "@jemaw/shared/types";
import { Button } from "../ui/primitives.js";
import { MemberAvatar } from "../ui/MemberAvatar.js";
import { Centered } from "./Balances.js";

export function Add() {
  const group = useGroup();
  const create = useCreateExpense();
  const editSuggestion = useEditSuggestion();
  const nav = useNavigate();
  const [params] = useSearchParams();
  const fromSuggestionId = params.get("from") ?? undefined;
  const suggestions = useSuggestions();
  const source = fromSuggestionId
    ? suggestions.data?.suggestions.find((s) => s.id === fromSuggestionId)
    : undefined;

  const members = group.data?.members.filter((m) => m.isActive) ?? [];

  const [description, setDescription] = useState("");
  const [amount, setAmount] = useState("");
  const [payer, setPayer] = useState<string>("");
  const [date, setDate] = useState<string>(todayISO());
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

  // Prefill from a suggestion when editing one.
  useEffect(() => {
    if (!source) return;
    setDescription(source.description);
    setAmount(source.amount);
    if (source.payerMemberId) setPayer(source.payerMemberId);
    setSplitType(source.splitType);
    setSplitWith(new Set(source.splitWith));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [source?.id]);

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
      occurredAt: dateToISO(date),
    };
    if (fromSuggestionId) {
      // Editing a suggestion → records an ai_edited expense + resolves it.
      await editSuggestion.mutateAsync({ id: fromSuggestionId, input });
      nav("/suggestions");
    } else {
      await create.mutateAsync(input);
      nav("/balances");
    }
  }

  return (
    <div style={{ padding: 16, display: "grid", gap: 16 }}>
      <h1 className="t-screen-title" style={{ margin: "8px 0 0" }}>
        {fromSuggestionId ? "Edit suggestion" : "Add expense"}
      </h1>

      <Group>
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
            className="tnum"
            style={{
              ...inputStyle,
              fontSize: 20,
              fontWeight: 600,
              fontVariantNumeric: "tabular-nums",
            }}
          />
        </Field>

        <Field label="When">
          <input
            type="date"
            value={date}
            max={todayISO()}
            onChange={(e) => setDate(e.target.value)}
            style={inputStyle}
          />
        </Field>
      </Group>

      <Group>
        <Field label="Paid by">
          <ChipRow>
            {members.map((m) => (
              <Chip
                key={m.id}
                active={payer === m.id}
                onClick={() => setPayer(m.id)}
                name={m.displayName}
                telegramUserId={m.telegramUserId}
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
                  <MemberAvatar
                    name={m.displayName}
                    telegramUserId={m.telegramUserId}
                    size={28}
                  />
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
      </Group>

      <Button
        disabled={!valid || create.isPending || editSuggestion.isPending}
        onClick={submit}
      >
        {create.isPending || editSuggestion.isPending ? "Adding…" : "Add"}
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

function Group({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        background: "var(--surface)",
        border: "1px solid var(--border)",
        borderRadius: "var(--r-lg)",
        padding: 16,
        display: "grid",
        gap: 18,
      }}
    >
      {children}
    </div>
  );
}

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
  telegramUserId,
}: {
  active: boolean;
  onClick: () => void;
  name: string;
  telegramUserId?: string;
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
      <MemberAvatar name={name} telegramUserId={telegramUserId} size={24} />
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

/** Today's date as YYYY-MM-DD (local). */
function todayISO(): string {
  const d = new Date();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
}

/** A YYYY-MM-DD date string → ISO at local noon (avoids TZ day-shift). */
function dateToISO(ymd: string): string {
  return new Date(`${ymd}T12:00:00`).toISOString();
}
