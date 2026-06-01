import { useNavigate } from "react-router-dom";
import { AnimatePresence, motion, type PanInfo } from "framer-motion";
import {
  useGroup,
  useSuggestions,
  useConfirmSuggestion,
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
  const confirm = useConfirmSuggestion();
  const dismiss = useDismissSuggestion();
  const nav = useNavigate();

  const currency = group.data?.defaultCurrency ?? "EUR";
  const nameOf = (id: string | null) =>
    id ? group.data?.members.find((m) => m.id === id)?.displayName ?? "Member" : "someone";

  if (q.isLoading) return <SkeletonList count={3} height={120} />;
  const list = q.data?.suggestions ?? [];

  if (list.length === 0) {
    return (
      <EmptyState
        icon="✦"
        title="Caught up"
        hint="Say “jemaw” in your group chat and Jemaw will draft expenses here."
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
            onAdd={() => confirm.mutate(s.id)}
            onDismiss={() => dismiss.mutate(s.id)}
            onEdit={() => nav(`/add?from=${s.id}`)}
            busy={confirm.isPending || dismiss.isPending}
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
  onAdd,
  onDismiss,
  onEdit,
  busy,
}: {
  s: SuggestionDto;
  index: number;
  currency: string;
  payerName: string;
  onAdd: () => void;
  onDismiss: () => void;
  onEdit: () => void;
  busy: boolean;
}) {
  const reduced = useReducedMotion();

  // Swipe-left to dismiss (§12.9): commit past 40% width or high velocity.
  function onDragEnd(_e: unknown, info: PanInfo) {
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
      dragElastic={{ left: 0.6, right: 0.1 }}
      onDragEnd={onDragEnd}
      whileTap={reduced ? undefined : { scale: 0.99 }}
      style={{
        position: "relative",
        background: "var(--surface)",
        border: "1px solid var(--border)",
        borderRadius: "var(--r-lg)",
        padding: 16,
        overflow: "hidden",
      }}
    >
      {/* confidence pill, top-right corner */}
      <span style={{ position: "absolute", top: 12, right: 12 }}>
        <Pill variant={s.tier === "normal" ? "accent" : "warn"}>
          {s.tier === "normal" ? "AI" : "low"}
        </Pill>
      </span>

      <div style={{ display: "flex", flexDirection: "column", gap: 2, paddingRight: 56 }}>
        <span className="t-body-strong">{s.description}</span>
        <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
          <span className="t-heading">
            <Money value={s.amount ?? "0.00"} currency={currency} />
          </span>
          <span className="t-caption" style={{ color: "var(--text-muted)" }}>
            {payerName} paid · split {s.splitWith.length}{" "}
            {s.splitWith.length === 1 ? "way" : "ways"}
          </span>
        </div>
      </div>

      {/* evidence / reasoning as a quoted block */}
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

      <div style={{ display: "flex", gap: 8, marginTop: 14 }}>
        <Button variant="ghost" onClick={onDismiss} disabled={busy} style={{ flex: 1 }}>
          Dismiss
        </Button>
        <Button variant="ghost" onClick={onEdit} disabled={busy} style={{ flex: 1 }}>
          Edit
        </Button>
        <Button onClick={onAdd} disabled={busy} style={{ flex: 1 }}>
          ✓ Add
        </Button>
      </div>
    </motion.div>
  );
}
