import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import {
  useGroup,
  useExpense,
  useEditExpense,
  useVoidExpense,
} from "../lib/hooks.js";
import type { CreateExpenseInput } from "@jemaw/shared/types";
import { Button, Avatar } from "../ui/primitives.js";
import { Modal } from "../motion/Modal.js";
import { Centered } from "./Balances.js";

/**
 * View + edit an existing expense (Phase 2). Equal-split editor for simplicity;
 * shares/exact editing reuses the Add screen in a later pass. Supports void.
 */
export function ExpenseDetail() {
  const { id } = useParams();
  const nav = useNavigate();
  const group = useGroup();
  const expense = useExpense(id);
  const edit = useEditExpense();
  const voidExpense = useVoidExpense();

  const members = group.data?.members.filter((m) => m.isActive) ?? [];

  const [description, setDescription] = useState("");
  const [amount, setAmount] = useState("");
  const [payer, setPayer] = useState("");
  const [splitWith, setSplitWith] = useState<Set<string>>(new Set());
  const [confirmVoid, setConfirmVoid] = useState(false);

  useEffect(() => {
    const e = expense.data;
    if (!e) return;
    setDescription(e.description);
    setAmount(e.amount);
    setPayer(e.payerMemberId);
    setSplitWith(new Set(e.shares.map((s) => s.memberId)));
  }, [expense.data]);

  if (expense.isLoading || group.isLoading) return <Centered>Loading…</Centered>;
  if (!expense.data) return <Centered>Expense not found.</Centered>;
  if (expense.data.voidedAt) return <Centered>This expense was voided.</Centered>;

  const participants = [...splitWith];
  const valid =
    description.trim().length > 0 &&
    /^\d+(\.\d{1,2})?$/.test(amount) &&
    Number(amount) > 0 &&
    payer &&
    participants.length > 0;

  function toggle(mid: string) {
    const next = new Set(splitWith);
    next.has(mid) ? next.delete(mid) : next.add(mid);
    setSplitWith(next);
  }

  async function save() {
    const input: CreateExpenseInput = {
      description: description.trim(),
      amount,
      payerMemberId: payer,
      splitType: "equal",
      splitWith: participants,
    };
    await edit.mutateAsync({ expenseId: id!, input });
    nav("/history");
  }

  async function doVoid() {
    await voidExpense.mutateAsync(id!);
    nav("/history");
  }

  return (
    <div style={{ padding: 16, display: "grid", gap: 20 }}>
      <h1 className="t-screen-title" style={{ margin: "8px 0 0" }}>
        Edit expense
      </h1>

      <Field label="Description">
        <input value={description} onChange={(e) => setDescription(e.target.value)} style={inputStyle} />
      </Field>

      <Field label="Amount">
        <input
          value={amount}
          onChange={(e) => setAmount(e.target.value.replace(/[^\d.]/g, ""))}
          inputMode="decimal"
          className="tnum t-display"
          style={{ ...inputStyle, fontVariantNumeric: "tabular-nums" }}
        />
      </Field>

      <Field label="Paid by">
        <div style={{ display: "flex", gap: 8, overflowX: "auto", paddingBottom: 4 }}>
          {members.map((m) => (
            <Chip key={m.id} active={payer === m.id} onClick={() => setPayer(m.id)} name={m.displayName} />
          ))}
        </div>
      </Field>

      <Field label="Split between (equal)">
        <div style={{ display: "grid", gap: 8 }}>
          {members.map((m) => {
            const on = splitWith.has(m.id);
            return (
              <button
                key={m.id}
                onClick={() => toggle(m.id)}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  padding: "8px 12px",
                  borderRadius: "var(--r-md)",
                  border: on ? "1px solid var(--accent)" : "1px solid var(--border)",
                  background: on ? "var(--accent-soft)" : "transparent",
                  color: "var(--text)",
                  cursor: "pointer",
                }}
              >
                <Avatar name={m.displayName} size={28} />
                <span className="t-body-strong">{m.displayName}</span>
              </button>
            );
          })}
        </div>
      </Field>

      <div style={{ display: "flex", gap: 8 }}>
        <Button variant="danger" onClick={() => setConfirmVoid(true)} style={{ flex: 1 }}>
          Void
        </Button>
        <Button onClick={save} disabled={!valid || edit.isPending} style={{ flex: 1 }}>
          {edit.isPending ? "Saving…" : "Save"}
        </Button>
      </div>

      <Modal open={confirmVoid} onClose={() => setConfirmVoid(false)}>
        <h2 className="t-heading" style={{ marginTop: 0 }}>
          Void this expense?
        </h2>
        <p className="t-body" style={{ color: "var(--text-muted)" }}>
          It will be removed from balances and history. This can't be undone.
        </p>
        <div style={{ display: "flex", gap: 8, marginTop: 16 }}>
          <Button
            variant="ghost"
            onClick={() => setConfirmVoid(false)}
            style={{ flex: 1 }}
          >
            Cancel
          </Button>
          <Button variant="danger" onClick={doVoid} style={{ flex: 1 }}>
            {voidExpense.isPending ? "Voiding…" : "Void"}
          </Button>
        </div>
      </Modal>
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
      <span className="t-label" style={{ color: "var(--text-muted)" }}>{label}</span>
      {children}
    </label>
  );
}

function Chip({ active, onClick, name }: { active: boolean; onClick: () => void; name: string }) {
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

