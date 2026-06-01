/**
 * Settle form — record a payment between two members. Mirrors the expense form:
 * from/to selectors, editable amount (auto-filled by the selected expenses),
 * date, payment method, optional description, and a searchable/filterable
 * scrollable list of expenses you can mark as part of this settlement.
 *
 * Prefilled from query params (settle listing or AI suggestion):
 *   ?to=<memberId>&from=<memberId>&amount=<decimal>&method=<m>&expenses=<id,id>
 */
import { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import {
  useGroup,
  useExpenses,
  useCreateSettlement,
} from "../lib/hooks.js";
import { MemberAvatar } from "../ui/MemberAvatar.js";
import { Button } from "../ui/primitives.js";
import { PageHeader } from "../ui/PageHeader.js";
import { PageLoader } from "../motion/Loader.js";
import { Centered } from "./Balances.js";
import { decimalToCents, centsToDecimal } from "@jemaw/shared/types";
import type { PaymentMethod, ExpenseDto } from "@jemaw/shared/types";
import { formatMoney } from "../lib/money.js";
import { currentTelegramId } from "../telegram.js";

const METHODS: { value: PaymentMethod; label: string }[] = [
  { value: "cash", label: "Cash" },
  { value: "bank", label: "Bank" },
  { value: "telebirr", label: "Telebirr" },
];

export function SettleForm() {
  const group = useGroup();
  const expensesQ = useExpenses();
  const create = useCreateSettlement();
  const nav = useNavigate();
  const [params] = useSearchParams();

  const members = group.data?.members.filter((m) => m.isActive) ?? [];
  const currency = group.data?.defaultCurrency ?? "EUR";
  const expenses = expensesQ.data ?? [];

  const me = useMemo(() => {
    const tg = currentTelegramId();
    return (
      members.find((m) => m.telegramUserId === tg)?.id ??
      params.get("from") ??
      members[0]?.id ??
      ""
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [group.data]);

  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState(todayISO());
  const [method, setMethod] = useState<PaymentMethod>("cash");
  const [description, setDescription] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [query, setQuery] = useState("");
  const [touchedAmount, setTouchedAmount] = useState(false);

  // Prefill from params once data is ready.
  useEffect(() => {
    if (!group.data) return;
    setFrom(params.get("from") ?? me);
    setTo(params.get("to") ?? "");
    const a = params.get("amount");
    if (a) {
      setAmount(a);
      setTouchedAmount(true);
    }
    const m = params.get("method") as PaymentMethod | null;
    if (m) setMethod(m);
    const exp = params.get("expenses");
    if (exp) setSelected(new Set(exp.split(",").filter(Boolean)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [group.data]);

  // Expenses relevant to this from→to pair: ones where `from` owes `to`
  // (to paid, from has a share). Used both for the list and the auto-total.
  const relevant = useMemo(
    () => expenses.filter((e) => isOwedBetween(e, from, to)),
    [expenses, from, to],
  );

  // Auto-fill the amount from the selected expenses' owed shares (unless edited).
  useEffect(() => {
    if (touchedAmount) return;
    const cents = relevant
      .filter((e) => selected.has(e.id))
      .reduce((sum, e) => sum + owedShareCents(e, from), 0);
    if (cents > 0) setAmount(centsToDecimal(cents));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected, relevant]);

  if (group.isLoading || expensesQ.isLoading) return <PageLoader />;
  if (members.length < 2)
    return <Centered>Need at least two members to settle.</Centered>;

  const filtered = relevant.filter((e) =>
    e.description.toLowerCase().includes(query.trim().toLowerCase()),
  );
  const allSelected =
    filtered.length > 0 && filtered.every((e) => selected.has(e.id));

  const valid =
    from && to && from !== to && /^\d+(\.\d{1,2})?$/.test(amount) && Number(amount) > 0;

  function toggleAll() {
    const next = new Set(selected);
    if (allSelected) filtered.forEach((e) => next.delete(e.id));
    else filtered.forEach((e) => next.add(e.id));
    setSelected(next);
  }
  function toggle(id: string) {
    const next = new Set(selected);
    next.has(id) ? next.delete(id) : next.add(id);
    setSelected(next);
  }

  async function submit() {
    await create.mutateAsync({
      fromMemberId: from,
      toMemberId: to,
      amount,
      method,
      description: description.trim() || undefined,
      expenseIds: [...selected],
      occurredAt: dateToISO(date),
    });
    nav("/settle");
  }

  return (
    <div>
      <PageHeader title="Settle up" fallback="/settle" />
      <div style={{ padding: "0 16px 16px", display: "grid", gap: 16 }}>
      <Group>
        <Field label="Paid by" icon="◎">
          <MemberPicker members={members} value={from} onChange={setFrom} />
        </Field>
        <Field label="Paid to" icon="→">
          <MemberPicker
            members={members.filter((m) => m.id !== from)}
            value={to}
            onChange={setTo}
          />
        </Field>
        <Field label="Amount" icon="€">
          <input
            value={amount}
            onChange={(e) => {
              setAmount(e.target.value.replace(/[^\d.]/g, ""));
              setTouchedAmount(true);
            }}
            inputMode="decimal"
            placeholder="0.00"
            className="tnum"
            style={{ ...inputStyle, fontSize: 20, fontWeight: 600 }}
          />
        </Field>
        <Field label="When" icon="◷">
          <div style={{ position: "relative" }}>
            <div style={{ ...inputStyle, display: "flex", alignItems: "center", pointerEvents: "none" }}>
              {friendlyDate(date)}
            </div>
            <input
              type="date"
              value={date}
              max={todayISO()}
              onChange={(e) => setDate(e.target.value)}
              style={{ ...inputStyle, position: "absolute", inset: 0, opacity: 0 }}
            />
          </div>
        </Field>
        <Field label="Method" icon="≋">
          <Segmented value={method} onChange={setMethod} options={METHODS} />
        </Field>
        <Field label="Note (optional)" icon="✎">
          <input
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="e.g. via Telebirr"
            style={inputStyle}
          />
        </Field>
      </Group>

      {/* expense selection */}
      {to && (
        <Group>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span className="t-label" style={{ color: "var(--text-muted)" }}>
              Expenses to settle ({selected.size})
            </span>
            <button onClick={toggleAll} className="t-label" style={linkBtn}>
              {allSelected ? "Deselect all" : "Select all"}
            </button>
          </div>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search expenses…"
            style={{ ...inputStyle, height: 40 }}
          />
          {filtered.length === 0 ? (
            <p className="t-caption" style={{ color: "var(--text-faint)", margin: 0 }}>
              {relevant.length === 0
                ? "No shared expenses between these two."
                : "No matches."}
            </p>
          ) : (
            <div style={{ maxHeight: 220, overflowY: "auto", display: "grid", gap: 6 }}>
              {filtered.map((e) => {
                const on = selected.has(e.id);
                return (
                  <button
                    key={e.id}
                    onClick={() => toggle(e.id)}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 10,
                      padding: "8px 10px",
                      borderRadius: "var(--r-md)",
                      border: on ? "1px solid var(--accent)" : "1px solid var(--border)",
                      background: on ? "var(--accent-soft)" : "transparent",
                      color: "var(--text)",
                      cursor: "pointer",
                      textAlign: "left",
                    }}
                  >
                    <span
                      style={{
                        width: 18,
                        height: 18,
                        borderRadius: 5,
                        border: on ? "none" : "1px solid var(--border-strong)",
                        background: on ? "var(--accent)" : "transparent",
                        color: "#0B0B0C",
                        display: "grid",
                        placeItems: "center",
                        fontSize: 12,
                        flexShrink: 0,
                      }}
                    >
                      {on ? "✓" : ""}
                    </span>
                    <span className="t-body-strong" style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {e.description}
                    </span>
                    <span className="t-caption" style={{ color: "var(--text-muted)" }}>
                      {formatMoney(centsToDecimal(owedShareCents(e, from)), currency)}
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        </Group>
      )}

      <Button disabled={!valid || create.isPending} onClick={submit}>
        {create.isPending ? "Recording…" : "Record settlement"}
      </Button>
      </div>
    </div>
  );
}

// ── helpers: how much `from` owes for an expense `to` paid ──
function isOwedBetween(e: ExpenseDto, from: string, to: string): boolean {
  if (!from || !to) return false;
  return e.payerMemberId === to && e.shares.some((s) => s.memberId === from);
}
function owedShareCents(e: ExpenseDto, from: string): number {
  const share = e.shares.find((s) => s.memberId === from);
  return share ? decimalToCents(share.shareAmount) : 0;
}

// ── small form bits ──
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

function Field({ label, icon, children }: { label: string; icon?: string; children: React.ReactNode }) {
  return (
    <label style={{ display: "grid", gap: 8 }}>
      <span className="t-label" style={{ color: "var(--text-muted)", display: "flex", alignItems: "center", gap: 6 }}>
        {icon && (
          <span aria-hidden style={{ width: 22, height: 22, borderRadius: "var(--r-sm)", background: "var(--accent-soft)", color: "var(--accent)", display: "grid", placeItems: "center", fontSize: 12 }}>
            {icon}
          </span>
        )}
        {label}
      </span>
      {children}
    </label>
  );
}

function MemberPicker({
  members,
  value,
  onChange,
}: {
  members: { id: string; displayName: string; telegramUserId: string }[];
  value: string;
  onChange: (id: string) => void;
}) {
  return (
    <div style={{ display: "flex", gap: 8, overflowX: "auto", paddingBottom: 4 }}>
      {members.map((m) => {
        const active = value === m.id;
        return (
          <button
            key={m.id}
            onClick={() => onChange(m.id)}
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
            <MemberAvatar name={m.displayName} telegramUserId={m.telegramUserId} size={24} />
            <span className="t-label">{m.displayName}</span>
          </button>
        );
      })}
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
    <div style={{ display: "flex", background: "var(--bg)", border: "1px solid var(--border)", borderRadius: "var(--r-md)", padding: 3, gap: 3 }}>
      {options.map((o) => (
        <button
          key={o.value}
          onClick={() => onChange(o.value)}
          className="t-label"
          style={{
            flex: 1,
            height: 32,
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

const linkBtn: React.CSSProperties = {
  border: "none",
  background: "transparent",
  color: "var(--accent)",
  cursor: "pointer",
};

function todayISO(): string {
  const d = new Date();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
}
function dateToISO(ymd: string): string {
  return new Date(`${ymd}T12:00:00`).toISOString();
}
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
function friendlyDate(ymd: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ymd);
  return m ? `${MONTHS[Number(m[2]) - 1]} ${Number(m[3])} ${m[1]}` : ymd;
}
