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
  useSuggestions,
  useEditSettlementSuggestion,
} from "../lib/hooks.js";
import { MemberAvatar } from "../ui/MemberAvatar.js";
import { PageHeader } from "../ui/PageHeader.js";
import { PageLoader } from "../motion/Loader.js";
import { Centered } from "./Balances.js";
import { decimalToCents, centsToDecimal } from "@jemaw/shared/types";
import type { PaymentMethod, ExpenseDto } from "@jemaw/shared/types";
import { formatMoney } from "../lib/money.js";
import { ApiError } from "../lib/api.js";
import { AlertBanner } from "../ui/AlertBanner.js";
import { currentTelegramId } from "../telegram.js";

const METHODS: { value: PaymentMethod; label: string }[] = [
  { value: "cash", label: "Cash" },
  { value: "bank", label: "Bank" },
  { value: "telebirr", label: "Telebirr" },
];

export function SettleForm() {
  const group = useGroup();
  const [params] = useSearchParams();
  // Filter the selectable list to what the payer still owes. The `from` param
  // is present for every settle entry point (settle list + AI suggestion), so
  // it's a reliable hint; the client-side remaining filter below covers the
  // rest once the resolved `from` state is known.
  const expensesQ = useExpenses(params.get("from") ?? undefined);
  // Counter direction: entries the payee still owes the payer, netted against
  // this payment so the amount matches the settle plan's netted figure.
  const counterQ = useExpenses(params.get("to") ?? undefined);
  const suggestionsQ = useSuggestions();
  const create = useCreateSettlement();
  const editSuggestion = useEditSettlementSuggestion();
  const nav = useNavigate();
  const suggestionId = params.get("suggestion") ?? undefined;

  const members = group.data?.members.filter((m) => m.isActive) ?? [];
  const currency = group.data?.defaultCurrency ?? "EUR";
  const expenses = expensesQ.data ?? [];
  const settlementSuggestion = useMemo(
    () =>
      suggestionId
        ? suggestionsQ.data?.suggestions.find(
            (s) => s.id === suggestionId && s.kind === "settlement",
          )
        : undefined,
    [suggestionId, suggestionsQ.data],
  );

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
  const [formError, setFormError] = useState<
    { title: string; message: string; showSuggestions?: boolean } | null
  >(null);

  // Prefill from params. The amount is the settle plan's net (e.g. 450), which
  // already accounts for both directions and prior settlements — we trust it
  // rather than re-deriving a one-directional share sum that would diverge.
  useEffect(() => {
    if (!group.data) return;
    setFrom(params.get("from") ?? settlementSuggestion?.fromMemberId ?? me);
    setTo(params.get("to") ?? settlementSuggestion?.toMemberId ?? "");
    const a = params.get("amount") ?? settlementSuggestion?.amount;
    if (a) setAmount(a);
    const m = params.get("method") as PaymentMethod | null;
    if (m) setMethod(m);
    if (settlementSuggestion?.description) {
      setDescription(settlementSuggestion.description);
    }
    const exp = params.get("expenses");
    if (exp) setSelected(new Set(exp.split(",").filter(Boolean)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [group.data, settlementSuggestion?.id]);

  // Expenses relevant to this from→to pair: ones where `from` still owes `to`
  // (to paid, from has an unsettled share). Already-settled shares are excluded
  // so a payer never re-sees an entry they've cleared. They do NOT drive the
  // amount (the net does).
  const relevant = useMemo(
    () => expenses.filter((e) => isOwedBetween(e, from, to) && owedShareCents(e, from) > 0),
    [expenses, from, to],
  );

  // Entries where `to` owes `from` (the reverse direction). Their total is the
  // credit netted off what `from` pays.
  const counter = useMemo(
    () =>
      (counterQ.data ?? []).filter(
        (e) => isOwedBetween(e, to, from) && owedShareCents(e, to) > 0,
      ),
    [counterQ.data, from, to],
  );
  const counterTotalCents = counter.reduce(
    (sum, e) => sum + owedShareCents(e, to),
    0,
  );

  // Reset selection when the from→to pair changes (unless the link named specific ones).
  const [selectedPair, setSelectedPair] = useState("");
  useEffect(() => {
    if (!from || !to) return;
    const pair = `${from}>${to}`;
    if (pair === selectedPair) return;
    setSelectedPair(pair);
    if (params.get("expenses")) return; // link named specific expenses — keep them
    setSelected(new Set()); // start empty; user picks what this payment covers
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [from, to, expenses]);

  const toName = members.find((m) => m.id === to)?.displayName ?? "them";
  // Gross of the selected owed shares; the credit is what nets off it so the
  // payable amount matches the settle plan's netted figure.
  const selectedGrossCents = relevant
    .filter((e) => selected.has(e.id))
    .reduce((sum, e) => sum + owedShareCents(e, from), 0);
  const creditAppliedCents = Math.min(counterTotalCents, selectedGrossCents);
  const computedPayCents = selectedGrossCents - creditAppliedCents;

  // Keep the amount in step with the calculation until the user edits it.
  const [amountEdited, setAmountEdited] = useState(false);
  useEffect(() => {
    if (amountEdited || selected.size === 0) return;
    setAmount(centsToDecimal(computedPayCents));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected, computedPayCents, amountEdited]);

  if (group.isLoading || expensesQ.isLoading || (suggestionId && suggestionsQ.isLoading)) {
    return <PageLoader />;
  }
  if (suggestionId && !settlementSuggestion) {
    return <Centered>Settlement suggestion not found.</Centered>;
  }
  if (members.length < 2)
    return <Centered>Need at least two members to settle.</Centered>;

  const filtered = relevant.filter((e) =>
    e.description.toLowerCase().includes(query.trim().toLowerCase()),
  );
  const allSelected =
    filtered.length > 0 && filtered.every((e) => selected.has(e.id));

  const valid =
    from &&
    to &&
    from !== to &&
    /^\d+(\.\d{1,2})?$/.test(amount) &&
    Number(amount) > 0 &&
    selected.size >= 1;

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
    setFormError(null);
    const input = {
      fromMemberId: from,
      toMemberId: to,
      amount,
      method,
      description: description.trim() || undefined,
      expenseIds: [...selected],
      occurredAt: dateToISO(date),
    };
    try {
      if (suggestionId) {
        await editSuggestion.mutateAsync({ id: suggestionId, input });
      } else {
        await create.mutateAsync(input);
      }
      nav("/settle");
    } catch (err: unknown) {
      if (err instanceof ApiError && err.body.maxAllocatable) {
        setFormError({
          title: "Amount too high",
          message: `That's more than ${toName} is owed here. The most you can settle is ${formatMoney(err.body.maxAllocatable, currency)} — we've adjusted it for you.`,
        });
        setAmount(err.body.maxAllocatable);
      } else if (
        err instanceof ApiError &&
        /no current debt|already settled/i.test(err.body.error ?? "")
      ) {
        setFormError({
          title: "Already settled",
          message: "This pair is already even — there's nothing left to record. You can dismiss the suggestion instead.",
          showSuggestions: true,
        });
      } else if (err instanceof ApiError && err.body.error) {
        setFormError({ title: "Cannot settle", message: err.body.error });
      } else {
        setFormError({
          title: "Something went wrong",
          message: "Couldn't record this settlement. Please check your connection and try again.",
        });
      }
    }
  }

  return (
    <div>
      <PageHeader title={suggestionId ? "Edit settlement" : "Settle up"} fallback="/settle" />
      <div style={{ padding: "0 16px 16px", display: "grid", gap: 14 }}>
      {/* who pays whom — already determined, shown as a fixed presentation */}
      <DuoHeader
        from={members.find((m) => m.id === from)}
        to={members.find((m) => m.id === to)}
      />

      {/* amount + when, side by side */}
      <div style={{ display: "flex", gap: 10 }}>
        <div style={{ flex: 1.4, display: "grid", gap: 6 }}>
          <span className="t-mono-label" style={{ color: "var(--text-muted)" }}>Amount</span>
          <input
            value={amount}
            onChange={(e) => { setAmount(e.target.value.replace(/[^\d.]/g, "")); setAmountEdited(true); setFormError(null); }}
            inputMode="decimal"
            placeholder="0.00"
            className="tnum"
            style={{ ...inputStyle, fontSize: 18, fontWeight: 700 }}
          />
        </div>
        <div style={{ flex: 1, display: "grid", gap: 6 }}>
          <span className="t-mono-label" style={{ color: "var(--text-muted)" }}>When</span>
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
        </div>
      </div>

      {/* method */}
      <div style={{ display: "grid", gap: 6 }}>
        <span className="t-mono-label" style={{ color: "var(--text-muted)" }}>Method</span>
        <Segmented value={method} onChange={setMethod} options={METHODS} />
      </div>

      {/* note */}
      <div style={{ display: "grid", gap: 6 }}>
        <span className="t-mono-label" style={{ color: "var(--text-muted)" }}>Note (optional)</span>
        <input
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="e.g. via Telebirr"
          style={inputStyle}
        />
      </div>

      {/* settling your share of — check-tile entry rows */}
      {to && (
        <div style={{ display: "grid", gap: 10, marginTop: 2 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span style={{ fontSize: 13, fontWeight: 700, color: "var(--text)" }}>
              Settling your share of{" "}
              <span style={{ color: "var(--text-muted)", fontWeight: 500 }}>
                ({selected.size})
              </span>
            </span>
            <button
              onClick={toggleAll}
              style={{
                border: "none",
                background: "transparent",
                cursor: "pointer",
                fontSize: 12,
                fontWeight: 700,
                color: "var(--violet-300)",
              }}
            >
              {allSelected ? "Deselect all" : "Select all"}
            </button>
          </div>
          <p className="t-caption" style={{ color: "var(--text-faint)", margin: 0 }}>
            Entries {toName} paid or lent where you owe a share.
          </p>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search entries…"
            style={{ ...inputStyle, height: 40 }}
          />
          {filtered.length === 0 ? (
            <p className="t-caption" style={{ color: "var(--text-faint)", margin: 0 }}>
              {relevant.length === 0
                ? "No shared entries between these two."
                : "No matches."}
            </p>
          ) : (
            <div style={{ maxHeight: 240, overflowY: "auto", display: "grid", gap: 9 }}>
              {filtered.map((e) => {
                const on = selected.has(e.id);
                return (
                  <button
                    key={e.id}
                    onClick={() => toggle(e.id)}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 12,
                      padding: "12px 13px",
                      borderRadius: 13,
                      border: on
                        ? "1px solid var(--accent)"
                        : "1px solid var(--border)",
                      background: on ? "var(--surface-elevated)" : "var(--surface)",
                      opacity: on ? 1 : 0.65,
                      color: "var(--text)",
                      cursor: "pointer",
                      textAlign: "left",
                    }}
                  >
                    <span
                      style={{
                        width: 22,
                        height: 22,
                        borderRadius: 7,
                        border: on ? "none" : "1px solid rgba(255,255,255,0.2)",
                        background: on ? "var(--accent)" : "transparent",
                        color: "#fff",
                        display: "grid",
                        placeItems: "center",
                        fontSize: 16,
                        flexShrink: 0,
                      }}
                    >
                      {on ? "✓" : ""}
                    </span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div
                        style={{
                          fontSize: 14,
                          fontWeight: 600,
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {e.description}
                      </div>
                      <div
                        className="t-caption"
                        style={{ fontSize: 10, color: "var(--text-faint)", marginTop: 2 }}
                      >
                        {expenseDateLabel(e.occurredAt)}
                      </div>
                    </div>
                    <span style={{ flexShrink: 0, textAlign: "right" }}>
                      <div className="tnum" style={{ fontSize: 14, fontWeight: 700, color: "var(--text)" }}>
                        {formatMoney(centsToDecimal(owedShareCents(e, from)), currency)}
                      </div>
                      <div className="tnum" style={{ fontSize: 10, color: "var(--text-faint)" }}>
                        of {formatMoney(e.amount, currency)}
                      </div>
                    </span>
                  </button>
                );
              })}
            </div>
          )}

          {/* The calculation: how the selected shares net down to the amount. */}
          {selected.size > 0 && (
            <div
              style={{
                border: "1px solid var(--border)",
                borderRadius: 13,
                padding: "12px 13px",
                display: "grid",
                gap: 7,
                background: "var(--surface)",
              }}
            >
              <span className="t-mono-label" style={{ color: "var(--text-muted)" }}>
                The calculation
              </span>
              {relevant
                .filter((e) => selected.has(e.id))
                .map((e) => (
                  <CalcRow
                    key={e.id}
                    label={e.description}
                    amount={formatMoney(centsToDecimal(owedShareCents(e, from)), currency)}
                  />
                ))}
              {creditAppliedCents > 0 &&
                apportionCredit(counter, to, creditAppliedCents).map((c) => (
                  <CalcRow
                    key={c.id}
                    label={`${toName} owes you · ${c.description}`}
                    amount={`−${formatMoney(centsToDecimal(c.cents), currency)}`}
                    muted
                  />
                ))}
              <div style={{ borderTop: "1px solid var(--border)", paddingTop: 7 }}>
                <CalcRow
                  label="You pay"
                  amount={formatMoney(centsToDecimal(computedPayCents), currency)}
                  strong
                />
              </div>
            </div>
          )}
        </div>
      )}

      {formError && (
        <AlertBanner
          tone="error"
          title={formError.title}
          message={formError.message}
          action={
            formError.showSuggestions
              ? { label: "View suggestions", onClick: () => nav("/suggestions") }
              : undefined
          }
          onDismiss={() => setFormError(null)}
        />
      )}
      {to && selected.size === 0 && (
        <p className="t-caption" style={{ color: "var(--text-muted)", margin: 0 }}>
          Select at least one expense above to continue.
        </p>
      )}
      <button
        disabled={!valid || create.isPending || editSuggestion.isPending}
        onClick={submit}
        style={{
          width: "100%",
          border: "none",
          borderRadius: 14,
          padding: 15,
          fontSize: 16,
          fontWeight: 700,
          color: "#fff",
          background: "var(--accent)",
          boxShadow: "0 10px 26px -8px rgba(110,89,199,.6)",
          cursor: valid ? "pointer" : "not-allowed",
          opacity: !valid || create.isPending || editSuggestion.isPending ? 0.55 : 1,
          transition: "opacity var(--dur-fast)",
        }}
      >
        {create.isPending || editSuggestion.isPending
          ? "Recording…"
          : suggestionId
            ? "Save settlement"
            : "Record settlement"}
      </button>
      </div>
    </div>
  );
}

/** Fixed "who pays whom" presentation — payer → arrow → payee. The pair is
 * already determined (from the Settle list or a suggestion), so it's shown,
 * not picked. */
function DuoHeader({
  from,
  to,
}: {
  from?: { displayName: string; telegramUserId: string };
  to?: { displayName: string; telegramUserId: string };
}) {
  if (!from || !to) return null;
  return (
    <div
      style={{
        background: "var(--surface)",
        border: "1px solid var(--border)",
        borderRadius: 18,
        padding: 16,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        gap: 14,
      }}
    >
      <div style={{ textAlign: "center" }}>
        <div style={{ margin: "0 auto 6px" }}>
          <MemberAvatar name={from.displayName} telegramUserId={from.telegramUserId} size={46} />
        </div>
        <div style={{ fontSize: 11, color: "var(--text-muted)" }}>
          {firstName(from.displayName)} pays
        </div>
      </div>
      <svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="var(--accent)" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
        <line x1="4" y1="12" x2="19" y2="12" />
        <polyline points="13 6 19 12 13 18" />
      </svg>
      <div style={{ textAlign: "center" }}>
        <div style={{ margin: "0 auto 6px" }}>
          <MemberAvatar name={to.displayName} telegramUserId={to.telegramUserId} size={46} />
        </div>
        <div style={{ fontSize: 11, color: "var(--text-muted)" }}>
          {firstName(to.displayName)}
        </div>
      </div>
    </div>
  );
}

function firstName(name: string): string {
  return name.trim().split(/\s+/)[0] ?? name;
}

function CalcRow({
  label,
  amount,
  muted,
  strong,
}: {
  label: string;
  amount: string;
  muted?: boolean;
  strong?: boolean;
}) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 10 }}>
      <span
        className={strong ? "t-body-strong" : "t-caption"}
        style={{
          color: strong ? "var(--text)" : muted ? "var(--positive)" : "var(--text-muted)",
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
          minWidth: 0,
        }}
      >
        {label}
      </span>
      <span
        className="tnum"
        style={{
          flexShrink: 0,
          fontSize: strong ? 15 : 12,
          fontWeight: strong ? 700 : 600,
          color: strong ? "var(--text)" : muted ? "var(--positive)" : "var(--text)",
        }}
      >
        {amount}
      </span>
    </div>
  );
}

/**
 * Apportion the applied credit across the counter entries oldest first, so
 * each credit line in the calculation shows the slice actually netted.
 */
function apportionCredit(
  counter: ExpenseDto[],
  to: string,
  creditCents: number,
): { id: string; description: string; cents: number }[] {
  const sorted = [...counter].sort(
    (a, b) => new Date(a.occurredAt).getTime() - new Date(b.occurredAt).getTime(),
  );
  const rows: { id: string; description: string; cents: number }[] = [];
  let remaining = creditCents;
  for (const e of sorted) {
    if (remaining <= 0) break;
    const give = Math.min(remaining, owedShareCents(e, to));
    if (give > 0) {
      rows.push({ id: e.id, description: e.description, cents: give });
      remaining -= give;
    }
  }
  return rows;
}

// ── helpers: how much `from` owes for an entry `to` paid ──
function isOwedBetween(e: ExpenseDto, from: string, to: string): boolean {
  if (!from || !to) return false;
  return e.payerMemberId === to && e.shares.some((s) => s.memberId === from);
}
function owedShareCents(e: ExpenseDto, from: string): number {
  const share = e.shares.find((s) => s.memberId === from);
  if (!share) return 0;
  // Prefer the server-computed remaining (share minus what's already settled);
  // fall back to the full share when the field isn't present.
  return decimalToCents(share.remainingOwed ?? share.shareAmount);
}

// ── small form bits ──
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

const inputStyle: React.CSSProperties = {
  width: "100%",
  height: 44,
  padding: "0 12px",
  borderRadius: "var(--r-md)",
  border: "1px solid var(--border)",
  background: "var(--surface-3)",
  color: "var(--text)",
  fontSize: 16,
  fontFamily: "inherit",
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

/** Expense occurredAt → "(Mar 2 2026)" for share-entry subtext. */
function expenseDateLabel(iso: string): string {
  const ymd = iso.slice(0, 10);
  const label = friendlyDate(ymd);
  return label === ymd ? label : `(${label})`;
}
