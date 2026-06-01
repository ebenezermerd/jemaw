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
import { useReducedMotion } from "../motion/useReducedMotion.js";
import { spring } from "../motion/tokens.js";
import { Centered } from "./Balances.js";
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
      <Centered>
        <div style={{ textAlign: "center" }}>
          <div>Caught up.</div>
          <div className="t-caption" style={{ color: "var(--text-faint)", marginTop: 8 }}>
            Say "jemaw" in the group to scan the chat.
          </div>
        </div>
      </Centered>
    );
  }

  return (
    <div style={{ padding: 16, display: "grid", gap: 12 }}>
      <h1 className="t-title" style={{ margin: "8px 0 0" }}>
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
  const strip = s.tier === "normal" ? "var(--accent-soft)" : "var(--warn-soft)";

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
        paddingLeft: 20,
        overflow: "hidden",
      }}
    >
      <span style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: 4, background: strip }} />

      <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
        <span className="t-body-strong">{s.description}</span>
        <Money value={s.amount} currency={currency} />
      </div>

      <div className="t-caption" style={{ color: "var(--text-muted)", marginTop: 4 }}>
        {payerName} paid · split {s.splitWith.length}{" "}
        {s.splitWith.length === 1 ? "way" : "ways"}
        {s.tier === "low" && (
          <>
            {" · "}
            <Pill variant="warn">low confidence</Pill>
          </>
        )}
      </div>

      <div className="t-caption" style={{ color: "var(--text-faint)", marginTop: 8, fontStyle: "italic" }}>
        {s.reasoning}
      </div>

      <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
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
