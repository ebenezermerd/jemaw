import { useState } from "react";
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

export function History() {
  const [params, setParams] = useSearchParams();
  const [removing, setRemoving] = useState<RemovingTarget | null>(null);
  const nav = useNavigate();
  const memberFilter = params.get("member") ?? undefined;
  const group = useGroup();
  const history = useHistory(memberFilter);
  const voidExpense = useVoidExpense();
  const deleteSettlement = useDeleteSettlement();

  const currency = group.data?.defaultCurrency ?? "EUR";
  const members = group.data?.members ?? [];
  const nameOf = (id: string) =>
    members.find((m) => m.id === id)?.displayName ?? "Member";

  if (history.isLoading) return <SkeletonList count={4} height={56} />;
  const days = history.data?.days ?? [];

  return (
    <div style={{ padding: 16, maxWidth: "100%" }}>
      <h1 className="t-screen-title" style={{ margin: "8px 0 12px" }}>
        History
      </h1>

      <div style={{ display: "flex", gap: 8, marginBottom: 16, flexWrap: "wrap" }}>
        <FilterChip
          active={!memberFilter}
          onClick={() => setParams({})}
          label="All"
        />
        {members.map((m) => (
          <FilterChip
            key={m.id}
            active={memberFilter === m.id}
            onClick={() => setParams({ member: m.id })}
            label={m.displayName}
          />
        ))}
      </div>

      {days.length === 0 ? (
        <EmptyState
          compact
          icon="↻"
          title="Nothing here yet"
          hint="Expenses, loans, and settlements will appear in this timeline."
        />
      ) : (
        days.map((d) => (
          <section key={d.date} style={{ marginBottom: 20 }}>
            <p className="t-caption" style={{ color: "var(--text-faint)", margin: "0 0 8px" }}>
              {d.date}
            </p>
            <div style={{ display: "grid", gap: 8 }}>
              {d.items.map((item) =>
                item.kind === "expense" ? (
                  <SwipeRemove
                    key={item.expense.id}
                    onRemove={() =>
                      setRemoving({
                        kind: "expense",
                        id: item.expense.id,
                        label: item.expense.description,
                      })
                    }
                  >
                    <button
                      onClick={() => nav(`/expense/${item.expense.id}`)}
                      style={cardRow}
                    >
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
                      <div
                        className="t-body-strong"
                        style={{ textAlign: "right", marginTop: 8 }}
                      >
                        <Money value={item.expense.amount} currency={currency} />
                      </div>
                    </button>
                  </SwipeRemove>
                ) : (
                  <SwipeRemove
                    key={item.settlement.id}
                    onRemove={() =>
                      setRemoving({
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
                          <div
                            style={{
                              display: "flex",
                              alignItems: "center",
                              gap: 7,
                              minWidth: 0,
                            }}
                          >
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
                ),
              )}
            </div>
          </section>
        ))
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

/**
 * Entry type glyph (Jemaw Brand.dc.html): expense = violet box, loan = amber
 * diagonal, settlement = teal double-arrow. Replaces the generic avatar lead.
 */
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
        maxWidth: "min(100%, 180px)",
        padding: "0 12px",
        borderRadius: "var(--r-full)",
        border: active ? "1px solid var(--accent)" : "1px solid var(--border-strong)",
        background: active ? "var(--accent-soft)" : "transparent",
        color: active ? "var(--accent)" : "var(--text-muted)",
        cursor: "pointer",
        overflow: "hidden",
        textOverflow: "ellipsis",
        whiteSpace: "nowrap",
      }}
    >
      {label}
    </button>
  );
}
