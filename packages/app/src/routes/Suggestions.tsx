import { useNavigate } from "react-router-dom";
import { AnimatePresence, motion, type PanInfo } from "framer-motion";
import {
  useGroup,
  useSuggestions,
  useSettlePlan,
  useConfirmSuggestion,
  useConfirmSuggestionWithAmount,
  useDismissSuggestion,
} from "../lib/hooks.js";
import { Button, Money, Pill } from "../ui/primitives.js";
import { SkeletonList } from "../motion/Skeleton.js";
import { EmptyState } from "../ui/EmptyState.js";
import { useReducedMotion } from "../motion/useReducedMotion.js";
import { spring } from "../motion/tokens.js";
import type { SuggestionDto } from "@jemaw/shared/types";

export function Suggestions() {
  const group = useGroup();
  const q = useSuggestions();
  const plan = useSettlePlan();
  const confirm = useConfirmSuggestion();
  const confirmWithAmount = useConfirmSuggestionWithAmount();
  const dismiss = useDismissSuggestion();
  const nav = useNavigate();

  const currency = group.data?.defaultCurrency ?? "EUR";
  const nameOf = (id: string | null) =>
    id ? group.data?.members.find((m) => m.id === id)?.displayName ?? "Member" : "someone";

  // A settlement suggestion is already settled when no current transfer exists
  // for its from→to pair — recording it would be rejected by the API, so we
  // flag the card and block the Settle action instead.
  const isAlreadySettled = (s: SuggestionDto): boolean => {
    if (s.kind !== "settlement" || !s.fromMemberId || !s.toMemberId) return false;
    if (!plan.data) return false;
    return !plan.data.transfers.some(
      (t) => t.fromMemberId === s.fromMemberId && t.toMemberId === s.toMemberId,
    );
  };

  function editPath(s: SuggestionDto): string {
    if (s.kind !== "settlement") return `/add?from=${s.id}`;
    const p = new URLSearchParams();
    p.set("suggestion", s.id);
    if (s.fromMemberId) p.set("from", s.fromMemberId);
    if (s.toMemberId) p.set("to", s.toMemberId);
    if (s.amount) p.set("amount", s.amount);
    if (s.expenseIds.length > 0) p.set("expenses", s.expenseIds.join(","));
    return `/settle/new?${p.toString()}`;
  }

  if (q.isLoading) return <SkeletonList count={3} height={120} />;
  const list = q.data?.suggestions ?? [];

  if (list.length === 0) {
    return (
      <EmptyState
        icon="✦"
        title="Caught up"
        hint="Say “jemaw” in your group chat and Jemaw will draft expenses or loans here."
      />
    );
  }

  return (
    <div style={{ padding: 16, display: "grid", gap: 12 }}>
      <h1 className="t-screen-title" style={{ margin: "8px 0 0" }}>
        Suggestions
      </h1>
      <AnimatePresence mode="popLayout">
        {list.map((s, i) => (
          <Card
            key={s.id}
            index={i}
            s={s}
            currency={currency}
            payerName={nameOf(s.payerMemberId)}
            borrowerName={nameOf(s.splitWith[0] ?? null)}
            fromName={nameOf(s.fromMemberId)}
            toName={nameOf(s.toMemberId)}
            alreadySettled={isAlreadySettled(s)}
            untied={s.kind === "settlement" && s.expenseIds.length === 0}
            onAdd={() => {
              if (s.kind === "settlement") {
                if (s.amount && s.expenseIds.length > 0) {
                  confirmWithAmount.mutateAsync({ id: s.id, amount: s.amount }).catch(() => nav(editPath(s)));
                } else {
                  nav(editPath(s));
                }
              } else {
                confirm.mutate(s.id);
              }
            }}
            onDismiss={() => dismiss.mutate(s.id)}
            onEdit={() => nav(editPath(s))}
            busy={confirm.isPending || confirmWithAmount.isPending || dismiss.isPending}
          />
        ))}
      </AnimatePresence>
    </div>
  );
}

function Card({
  s,
  index,
  currency,
  payerName,
  borrowerName,
  fromName,
  toName,
  alreadySettled,
  untied,
  onAdd,
  onDismiss,
  onEdit,
  busy,
}: {
  s: SuggestionDto;
  index: number;
  currency: string;
  payerName: string;
  borrowerName: string;
  fromName: string;
  toName: string;
  alreadySettled: boolean;
  untied: boolean;
  onAdd: () => void;
  onDismiss: () => void;
  onEdit: () => void;
  busy: boolean;
}) {
  const reduced = useReducedMotion();

  // Swipe-right edits; swipe-left dismisses.
  function onDragEnd(_e: unknown, info: PanInfo) {
    if (info.offset.x > 120 || info.velocity.x > 600) onEdit();
    if (info.offset.x < -120 || info.velocity.x < -600) onDismiss();
  }

  return (
    <motion.div
      layout
      initial={reduced ? { opacity: 0 } : { opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      exit={reduced ? { opacity: 0 } : { opacity: 0, x: -300 }}
      transition={
        reduced ? { duration: 0.08 } : { ...spring.soft, delay: index * 0.04 }
      }
      drag={reduced ? false : "x"}
      dragConstraints={{ left: 0, right: 0 }}
      dragElastic={{ left: 0.6, right: 0.6 }}
      onDragEnd={onDragEnd}
      whileTap={reduced ? undefined : { scale: 0.99 }}
      style={{
        position: "relative",
        background: "var(--surface)",
        border: alreadySettled
          ? "1px solid var(--destructive, #e53e3e)"
          : untied
            ? "1px solid var(--warn, #d69e2e)"
            : "1px solid var(--border)",
        borderRadius: "var(--r-lg)",
        padding: 16,
        overflow: "hidden",
      }}
    >
      {/* confidence pill, top-right corner */}
      <span style={{ position: "absolute", top: 12, right: 12 }}>
        <Pill variant={s.tier === "normal" ? "positive" : "warn"}>
          {s.tier === "normal" ? "✦ AI" : "low"}
        </Pill>
      </span>

      <div style={{ display: "flex", flexDirection: "column", gap: 2, paddingRight: 56 }}>
        <span className="t-body-strong">{capitalize(s.description)}</span>
        <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
          <span className="t-heading">
            <Money value={s.amount ?? "0.00"} currency={currency} />
          </span>
          <span className="t-caption" style={{ color: "var(--text-muted)" }}>
            {s.kind === "settlement"
              ? `${fromName} paid ${toName}`
              : s.kind === "loan"
              ? `${payerName} lent · ${borrowerName} owes`
              : `${payerName} paid · split ${s.splitWith.length} ${
                  s.splitWith.length === 1 ? "way" : "ways"
                }`}
          </span>
        </div>
      </div>

      {/* evidence / reasoning — replaced by a status note when the pair is
          already even (red, blocked) or has no expenses matched yet (amber,
          actionable), so the user knows what to do. */}
      {alreadySettled ? (
        <div
          className="t-caption"
          style={{
            color: "var(--destructive, #e53e3e)",
            marginTop: 12,
            paddingLeft: 10,
            borderLeft: "2px solid var(--destructive, #e53e3e)",
            fontWeight: 600,
          }}
        >
          Already settled — you can dismiss this suggestion.
        </div>
      ) : untied ? (
        <div
          className="t-caption"
          style={{
            color: "var(--warn, #d69e2e)",
            marginTop: 12,
            paddingLeft: 10,
            borderLeft: "2px solid var(--warn, #d69e2e)",
            fontWeight: 600,
          }}
        >
          No expenses matched — tap Settle to choose what this payment covers.
        </div>
      ) : (
        <div
          className="t-caption"
          style={{
            color: "var(--text-muted)",
            marginTop: 12,
            paddingLeft: 10,
            borderLeft: "2px solid var(--border-strong)",
            fontStyle: "italic",
          }}
        >
          {s.reasoning}
        </div>
      )}

      <div style={{ display: "flex", gap: 8, marginTop: 14 }}>
        <Button variant="ghost" onClick={onDismiss} disabled={busy} style={{ flex: 1 }}>
          Dismiss
        </Button>
        <Button variant="ghost" onClick={onEdit} disabled={busy} style={{ flex: 1 }}>
          Edit
        </Button>
        <Button onClick={onAdd} disabled={busy || alreadySettled} style={{ flex: 1 }}>
          {s.kind === "settlement"
            ? "✓ Settle"
            : s.kind === "loan"
              ? "✓ Add loan"
              : "✓ Add"}
        </Button>
      </div>
    </motion.div>
  );
}

/** Capitalize the first letter (for AI descriptions that come back lowercase). */
function capitalize(s: string): string {
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : s;
}
