import { useMemo, useState } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import {
  type PanInfo,
  motion,
  useMotionValue,
  useTransform,
} from "framer-motion";
import {
  useDeleteSettlement,
  useGroup,
  useHistory,
  useVoidExpense,
} from "../lib/hooks.js";
import { Avatar, Button, Money } from "../ui/primitives.js";
import { SkeletonList } from "../motion/Skeleton.js";
import { EmptyState } from "../ui/EmptyState.js";
import { Modal } from "../motion/Modal.js";
import { useReducedMotion } from "../motion/useReducedMotion.js";
import {
  formatMemberChipLabel,
  memberDisplayName,
} from "../lib/names.js";
import type { HistoryItem } from "@jemaw/shared/types";

const PAGE_SIZE = 12;

/** Roomy card row: title/meta on top, amount on its own line — no clipping. */
const cardRow: React.CSSProperties = {
  display: "block",
  width: "100%",
  maxWidth: "100%",
  textAlign: "left",
  padding: 14,
  border: "1px solid var(--border)",
  background: "var(--surface)",
  borderRadius: "var(--r-lg)",
  color: "var(--text)",
  cursor: "pointer",
  overflow: "hidden",
};

const ellipsis: React.CSSProperties = {
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
};

type FlatEntry = { day: string; item: HistoryItem };

export function History() {
  const [params, setParams] = useSearchParams();
  const [removing, setRemoving] = useState<RemovingTarget | null>(null);
  const nav = useNavigate();
  const memberFilter = params.get("member") ?? undefined;
  const fromDate = params.get("from") ?? "";
  const toDate = params.get("to") ?? "";
  const page = Math.max(1, Number(params.get("page") ?? "1") || 1);

  const group = useGroup();
  const history = useHistory(memberFilter);
  const voidExpense = useVoidExpense();
  const deleteSettlement = useDeleteSettlement();

  const currency = group.data?.defaultCurrency ?? "EUR";
  const members = group.data?.members ?? [];
  const nameOf = (id: string) => memberDisplayName(members, id);

  const patchParams = (patch: Record<string, string | undefined>) => {
    const next = new URLSearchParams(params);
    for (const [key, value] of Object.entries(patch)) {
      if (value) next.set(key, value);
      else next.delete(key);
    }
    if ("member" in patch || "from" in patch || "to" in patch) {
      next.delete("page");
    }
    setParams(next);
  };

  const { pageItems, totalPages, totalItems, flatFiltered } = useMemo(() => {
    const days = history.data?.days ?? [];
    const flat: FlatEntry[] = days.flatMap((d) =>
      d.items.map((item) => ({ day: d.date, item })),
    );
    const filtered = flat.filter(({ day }) => {
      if (fromDate && day < fromDate) return false;
      if (toDate && day > toDate) return false;
      return true;
    });
    const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
    const safePage = Math.min(page, totalPages);
    const start = (safePage - 1) * PAGE_SIZE;
    const pageItems = filtered.slice(start, start + PAGE_SIZE);
    return {
      pageItems,
      totalPages,
      totalItems: filtered.length,
      flatFiltered: filtered,
    };
  }, [history.data, fromDate, toDate, page]);

  if (history.isLoading) return <SkeletonList count={4} height={56} />;

  return (
    <div style={{ padding: 16, maxWidth: "100%", paddingBottom: 24 }}>
      <h1 className="t-screen-title" style={{ margin: "8px 0 12px" }}>
        History
      </h1>

      <div
        style={{
          display: "flex",
          gap: 8,
          marginBottom: 12,
        }}
      >
        <DateFilterField
          label="From"
          value={fromDate}
          max={toDate || todayISO()}
          onChange={(v) => patchParams({ from: v || undefined })}
        />
        <DateFilterField
          label="To"
          value={toDate}
          min={fromDate || undefined}
          max={todayISO()}
          onChange={(v) => patchParams({ to: v || undefined })}
        />
      </div>

      <div
        className="history-member-scroll"
        style={{
          display: "flex",
          gap: 8,
          marginBottom: 16,
          overflowX: "auto",
          overflowY: "hidden",
          WebkitOverflowScrolling: "touch",
          paddingBottom: 2,
        }}
      >
        <FilterChip
          active={!memberFilter}
          onClick={() => patchParams({ member: undefined })}
          label="All"
        />
        {members.map((m) => (
          <FilterChip
            key={m.id}
            active={memberFilter === m.id}
            onClick={() => patchParams({ member: m.id })}
            label={formatMemberChipLabel(m.displayName)}
          />
        ))}
      </div>

      {flatFiltered.length === 0 ? (
        <EmptyState
          compact
          icon="↻"
          title="Nothing here yet"
          hint={
            fromDate || toDate || memberFilter
              ? "Try widening the date range or clearing the member filter."
              : "Expenses, loans, and settlements will appear in this timeline."
          }
        />
      ) : (
        <>
          <HistoryPageItems
            entries={pageItems}
            currency={currency}
            nameOf={nameOf}
            onExpense={(id) => nav(`/expense/${id}`)}
            onRemove={setRemoving}
          />
          {totalPages > 1 && (
            <HistoryPagination
              page={Math.min(page, totalPages)}
              totalPages={totalPages}
              totalItems={totalItems}
              onPage={(p) => patchParams({ page: String(p) })}
            />
          )}
        </>
      )}

      <Modal open={removing != null} onClose={() => setRemoving(null)}>
        <h2 className="t-heading" style={{ marginTop: 0 }}>
          Remove this {removing?.kind ?? "item"}?
        </h2>
        <p className="t-body" style={{ color: "var(--text-muted)" }}>
          {removing?.kind === "expense"
            ? "Balances and any settlement amounts registered to this expense will be updated."
            : "This settlement and its registered expense allocations will be removed."}
        </p>
        {removing?.label && (
          <p className="t-caption" style={{ color: "var(--text-faint)", ...ellipsis }}>
            {removing.label}
          </p>
        )}
        <div style={{ display: "flex", gap: 8, marginTop: 16 }}>
          <Button variant="ghost" onClick={() => setRemoving(null)} style={{ flex: 1 }}>
            Keep
          </Button>
          <Button
            variant="danger"
            disabled={voidExpense.isPending || deleteSettlement.isPending}
            onClick={() => {
              if (!removing) return;
              if (removing.kind === "expense") voidExpense.mutate(removing.id);
              else deleteSettlement.mutate(removing.id);
              setRemoving(null);
            }}
            style={{ flex: 1 }}
          >
            Remove
          </Button>
        </div>
      </Modal>
    </div>
  );
}

function HistoryPageItems({
  entries,
  currency,
  nameOf,
  onExpense,
  onRemove,
}: {
  entries: FlatEntry[];
  currency: string;
  nameOf: (id: string) => string;
  onExpense: (id: string) => void;
  onRemove: (t: RemovingTarget) => void;
}) {
  return (
    <div style={{ display: "grid", gap: 8 }}>
      {entries.map(({ day, item }, index) => {
        const showDay = index === 0 || entries[index - 1]!.day !== day;
        return (
          <div key={entryKey(item)}>
            {showDay && (
              <p
                className="t-caption"
                style={{
                  color: "var(--text-faint)",
                  margin: index === 0 ? "0 0 8px" : "12px 0 8px",
                }}
              >
                {dayLabel(day)}
              </p>
            )}
            {item.kind === "expense" ? (
              <SwipeRemove
                onRemove={() =>
                  onRemove({
                    kind: "expense",
                    id: item.expense.id,
                    label: item.expense.description,
                  })
                }
              >
                <button onClick={() => onExpense(item.expense.id)} style={cardRow}>
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <TypeGlyph kind={item.expense.kind === "loan" ? "loan" : "expense"} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div className="t-body-strong" style={ellipsis}>
                        {item.expense.description}
                      </div>
                      <div className="t-caption" style={{ color: "var(--text-muted)", ...ellipsis }}>
                        {item.expense.kind === "loan"
                          ? `${nameOf(item.expense.payerMemberId)} lent · ${nameOf(item.expense.shares[0]?.memberId ?? "")} owes`
                          : `${nameOf(item.expense.payerMemberId)} paid · split ${item.expense.shares.length}`}
                      </div>
                    </div>
                    {item.settled && <SettledBadge />}
                  </div>
                  <div className="t-body-strong" style={{ textAlign: "right", marginTop: 8 }}>
                    <Money value={item.expense.amount} currency={currency} />
                  </div>
                </button>
              </SwipeRemove>
            ) : (
              <SwipeRemove
                onRemove={() =>
                  onRemove({
                    kind: "settlement",
                    id: item.settlement.id,
                    label: `${nameOf(item.settlement.fromMemberId)} to ${nameOf(item.settlement.toMemberId)}`,
                  })
                }
              >
                <div style={{ ...cardRow, cursor: "default" }}>
                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: "auto minmax(0, 1fr)",
                      alignItems: "center",
                      gap: 10,
                    }}
                  >
                    <TypeGlyph kind="settlement" />
                    <div style={{ minWidth: 0 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 7, minWidth: 0 }}>
                        <Avatar name={nameOf(item.settlement.fromMemberId)} size={24} />
                        <span className="t-label" style={ellipsis}>
                          {nameOf(item.settlement.fromMemberId)}
                        </span>
                      </div>
                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 7,
                          minWidth: 0,
                          marginTop: 3,
                        }}
                      >
                        <Avatar name={nameOf(item.settlement.toMemberId)} size={24} />
                        <span className="t-caption" style={{ color: "var(--text-muted)", ...ellipsis }}>
                          paid to {nameOf(item.settlement.toMemberId)}
                        </span>
                      </div>
                    </div>
                  </div>
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "baseline",
                      gap: 10,
                      marginTop: 8,
                      minWidth: 0,
                    }}
                  >
                    <span className="t-caption" style={{ color: "var(--positive)", minWidth: 0, ...ellipsis }}>
                      {item.settled ? "fully settled" : "settled"}
                    </span>
                    <span className="t-body-strong" style={{ flexShrink: 0 }}>
                      <Money value={item.settlement.amount} currency={currency} />
                    </span>
                  </div>
                </div>
              </SwipeRemove>
            )}
          </div>
        );
      })}
    </div>
  );
}

function HistoryPagination({
  page,
  totalPages,
  totalItems,
  onPage,
}: {
  page: number;
  totalPages: number;
  totalItems: number;
  onPage: (page: number) => void;
}) {
  return (
    <div
      style={{
        marginTop: 20,
        padding: "12px 14px",
        borderRadius: "var(--r-lg)",
        border: "1px solid var(--border)",
        background: "var(--surface)",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 10,
      }}
    >
      <button
        type="button"
        disabled={page <= 1}
        onClick={() => onPage(page - 1)}
        className="t-label"
        style={pageBtnStyle(page <= 1)}
      >
        ← Prev
      </button>
      <span className="t-caption" style={{ color: "var(--text-muted)", textAlign: "center" }}>
        Page {page} of {totalPages}
        <span style={{ display: "block", fontSize: 10, color: "var(--text-faint)" }}>
          {totalItems} entries
        </span>
      </span>
      <button
        type="button"
        disabled={page >= totalPages}
        onClick={() => onPage(page + 1)}
        className="t-label"
        style={pageBtnStyle(page >= totalPages)}
      >
        Next →
      </button>
    </div>
  );
}

function pageBtnStyle(disabled: boolean): React.CSSProperties {
  return {
    height: 34,
    padding: "0 12px",
    borderRadius: "var(--r-full)",
    border: "1px solid var(--border-strong)",
    background: disabled ? "transparent" : "var(--accent-soft)",
    color: disabled ? "var(--text-faint)" : "var(--accent)",
    cursor: disabled ? "not-allowed" : "pointer",
    fontWeight: 600,
    opacity: disabled ? 0.5 : 1,
  };
}

function DateFilterField({
  label,
  value,
  onChange,
  min,
  max,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  min?: string;
  max?: string;
}) {
  return (
    <label
      style={{
        flex: 1,
        display: "grid",
        gap: 5,
        minWidth: 0,
      }}
    >
      <span className="t-mono-label" style={{ color: "var(--text-muted)", fontSize: 10 }}>
        {label}
      </span>
      <div style={{ position: "relative" }}>
        <div
          style={{
            ...dateInputShell,
            color: value ? "var(--text)" : "var(--text-faint)",
          }}
        >
          {value ? dayLabel(value) : "Any"}
        </div>
        <input
          type="date"
          value={value}
          min={min}
          max={max}
          onChange={(e) => onChange(e.target.value)}
          style={{
            ...dateInputShell,
            position: "absolute",
            inset: 0,
            opacity: 0,
            cursor: "pointer",
          }}
        />
      </div>
    </label>
  );
}

const dateInputShell: React.CSSProperties = {
  width: "100%",
  height: 40,
  padding: "0 11px",
  borderRadius: "var(--r-md)",
  border: "1px solid var(--border)",
  background: "var(--surface-3)",
  fontSize: 13,
  fontWeight: 600,
  fontFamily: "inherit",
  display: "flex",
  alignItems: "center",
};

function entryKey(item: HistoryItem): string {
  return item.kind === "expense" ? item.expense.id : item.settlement.id;
}

function todayISO(): string {
  const d = new Date();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
}

const MONTHS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

function dayLabel(ymd: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ymd);
  if (!m) return ymd;
  return `${MONTHS[Number(m[2]) - 1]} ${Number(m[3])}, ${m[1]}`;
}

type RemovingTarget = {
  kind: "expense" | "settlement";
  id: string;
  label: string;
};

function SwipeRemove({
  children,
  onRemove,
}: {
  children: React.ReactNode;
  onRemove: () => void;
}) {
  const reduced = useReducedMotion();
  const x = useMotionValue(0);
  const removeOpacity = useTransform(x, [-100, 0], [1, 0]);
  const swipeable = !reduced;

  function onDragEnd(_e: unknown, info: PanInfo) {
    if (info.offset.x < -100 || info.velocity.x < -600) onRemove();
  }

  return (
    <div
      style={{
        position: "relative",
        borderRadius: "var(--r-lg)",
        overflow: "hidden",
        maxWidth: "100%",
      }}
    >
      {swipeable && (
        <motion.div
          style={{
            position: "absolute",
            inset: 0,
            background: "var(--danger)",
            color: "#fff",
            display: "flex",
            alignItems: "center",
            justifyContent: "flex-end",
            paddingRight: 20,
            fontWeight: 700,
            opacity: removeOpacity,
          }}
        >
          Remove
        </motion.div>
      )}
      <motion.div
        drag={swipeable ? "x" : false}
        dragConstraints={{ left: 0, right: 0 }}
        dragElastic={0.45}
        dragSnapToOrigin
        onDragEnd={onDragEnd}
        style={{ x, position: "relative", maxWidth: "100%" }}
      >
        {children}
      </motion.div>
    </div>
  );
}

function SettledBadge() {
  return (
    <span
      className="t-caption"
      style={{
        flexShrink: 0,
        padding: "2px 7px",
        borderRadius: "var(--r-full)",
        background: "var(--positive-soft)",
        color: "var(--positive)",
        fontSize: 11,
      }}
    >
      settled
    </span>
  );
}

function TypeGlyph({ kind }: { kind: "expense" | "loan" | "settlement" }) {
  const tone =
    kind === "expense"
      ? { bg: "var(--accent-soft)", fg: "var(--accent)", glyph: "▦" }
      : kind === "loan"
        ? { bg: "var(--warn-soft)", fg: "var(--warn)", glyph: "⤢" }
        : { bg: "var(--positive-soft)", fg: "var(--positive)", glyph: "⇄" };
  return (
    <span
      aria-hidden
      style={{
        width: 28,
        height: 28,
        flexShrink: 0,
        borderRadius: 9,
        background: tone.bg,
        color: tone.fg,
        display: "grid",
        placeItems: "center",
        fontSize: 18,
      }}
    >
      {tone.glyph}
    </span>
  );
}

function FilterChip({
  active,
  onClick,
  label,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
}) {
  return (
    <button
      onClick={onClick}
      className="t-label"
      style={{
        height: 32,
        flex: "0 0 auto",
        padding: "0 14px",
        borderRadius: "var(--r-full)",
        border: active ? "1px solid var(--accent)" : "1px solid var(--border-strong)",
        background: active ? "var(--accent-soft)" : "transparent",
        color: active ? "var(--accent)" : "var(--text-muted)",
        cursor: "pointer",
        whiteSpace: "nowrap",
        fontWeight: active ? 600 : 500,
      }}
    >
      {label}
    </button>
  );
}
