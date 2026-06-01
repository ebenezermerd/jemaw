/**
 * Home: the personal summary card, then a tab switcher between two clean lists —
 * "Suggested" (AI expenses to add) and "Ready to settle" (transfers you owe).
 * Each list row is collapsible: tap to expand details + action buttons.
 */
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { AnimatePresence, motion } from "framer-motion";
import {
  useMeSummary,
  useGroup,
  useSuggestions,
  useSettlePlan,
  useConfirmSuggestion,
  useDismissSuggestion,
} from "../lib/hooks.js";
import { SummaryCard } from "../ui/SummaryCard.js";
import { MemberAvatar } from "../ui/MemberAvatar.js";
import { Money, Pill, Button } from "../ui/primitives.js";
import { EmptyState } from "../ui/EmptyState.js";
import { Modal } from "../motion/Modal.js";
import { Skeleton } from "../motion/Skeleton.js";
import { useReducedMotion } from "../motion/useReducedMotion.js";
import { type PanInfo, useMotionValue, useTransform } from "framer-motion";
import type { SuggestionDto, TransferDto } from "@jemaw/shared/types";

type Tab = "suggested" | "settle";

export function Home() {
  const summary = useMeSummary();
  const group = useGroup();
  const suggestions = useSuggestions();
  const settle = useSettlePlan();
  const confirm = useConfirmSuggestion();
  const dismiss = useDismissSuggestion();
  const nav = useNavigate();

  const currency = group.data?.defaultCurrency ?? "EUR";
  const members = group.data?.members ?? [];
  const nameOf = (id: string | null) =>
    id ? members.find((m) => m.id === id)?.displayName ?? "Member" : "someone";
  const tgId = (id: string) => members.find((m) => m.id === id)?.telegramUserId;
  const me = currentMemberId(members);

  const all = suggestions.data?.suggestions ?? [];
  const sugg = all.filter((s) => s.kind === "expense");
  const settleSugg = all.filter((s) => s.kind === "settlement");
  const transfers = (settle.data?.transfers ?? []).filter(
    (t) => me != null && t.fromMemberId === me,
  );
  const settleCount = settleSugg.length + transfers.length;

  // Default to whichever tab has items (prefer Suggested).
  const [tab, setTab] = useState<Tab>("suggested");
  const [removing, setRemoving] = useState<string | null>(null);
  useEffect(() => {
    if (sugg.length === 0 && settleCount > 0) setTab("settle");
    else if (sugg.length > 0) setTab("suggested");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sugg.length, settleCount]);

  return (
    <div style={{ paddingBottom: 8, overflowX: "hidden" }}>
      <div style={{ padding: 16, paddingBottom: 8 }}>
        {summary.isLoading || !summary.data ? (
          <Skeleton height={170} radius="var(--r-xl)" />
        ) : (
          <SummaryCard s={summary.data} />
        )}
      </div>

      <div style={{ padding: "0 16px", display: "grid", gap: 12 }}>
        <Tabs
          tab={tab}
          onTab={setTab}
          suggestedCount={sugg.length}
          settleCount={settleCount}
        />

        {tab === "suggested" ? (
          sugg.length === 0 ? (
            <EmptyState
              compact
              icon="✦"
              title="No suggestions yet"
              hint="Say “jemaw” in your group chat and Jemaw will draft expenses here."
            />
          ) : (
            <div style={{ display: "grid", gap: 8 }}>
              {sugg.map((s) => (
                <SuggestionRow
                  key={s.id}
                  s={s}
                  currency={currency}
                  payerName={nameOf(s.payerMemberId)}
                  onAdd={() => confirm.mutate(s.id)}
                  onRequestRemove={() => setRemoving(s.id)}
                  onEdit={() => nav(`/add?from=${s.id}`)}
                  busy={confirm.isPending || dismiss.isPending}
                />
              ))}
            </div>
          )
        ) : settleCount === 0 ? (
          <EmptyState
            compact
            icon="⇄"
            title="Nothing to settle"
            hint="When you owe someone — or Jemaw spots a payback in chat — it shows up here."
          />
        ) : (
          <div style={{ display: "grid", gap: 8 }}>
            {/* AI-detected settlements from chat → open the settle form prefilled */}
            {settleSugg.map((s) => (
              <SettlementSuggestionRow
                key={s.id}
                s={s}
                currency={currency}
                fromName={nameOf(s.fromMemberId)}
                toName={nameOf(s.toMemberId)}
                toTgId={s.toMemberId ? tgId(s.toMemberId) : undefined}
                onSettle={(amount) => {
                  const p = new URLSearchParams();
                  if (s.fromMemberId) p.set("from", s.fromMemberId);
                  if (s.toMemberId) p.set("to", s.toMemberId);
                  if (amount) p.set("amount", amount);
                  nav(`/settle/new?${p.toString()}`);
                }}
                onDismiss={() => setRemoving(s.id)}
                busy={dismiss.isPending}
              />
            ))}
            {/* computed transfers you owe → open the settle form prefilled */}
            {transfers.map((t, i) => (
              <SettleRow
                key={`${t.toMemberId}-${i}`}
                t={t}
                currency={currency}
                toName={nameOf(t.toMemberId)}
                toTgId={tgId(t.toMemberId)}
                onSettle={() =>
                  nav(`/settle/new?from=${t.fromMemberId}&to=${t.toMemberId}&amount=${t.amount}`)
                }
              />
            ))}
          </div>
        )}
      </div>

      {/* remove-suggestion confirmation (left-swipe or Remove button) */}
      <Modal open={removing != null} onClose={() => setRemoving(null)}>
        <h2 className="t-heading" style={{ marginTop: 0 }}>
          Remove this suggestion?
        </h2>
        <p className="t-body" style={{ color: "var(--text-muted)" }}>
          It won't be added. Jemaw can suggest it again on the next scan.
        </p>
        <div style={{ display: "flex", gap: 8, marginTop: 16 }}>
          <Button variant="ghost" onClick={() => setRemoving(null)} style={{ flex: 1 }}>
            Keep
          </Button>
          <Button
            variant="danger"
            onClick={() => {
              if (removing) dismiss.mutate(removing);
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

// ─── Tabs ─────────────────────────────────────────────────────────────
function Tabs({
  tab,
  onTab,
  suggestedCount,
  settleCount,
}: {
  tab: Tab;
  onTab: (t: Tab) => void;
  suggestedCount: number;
  settleCount: number;
}) {
  const item = (key: Tab, label: string, count: number) => {
    const active = tab === key;
    return (
      <button
        onClick={() => onTab(key)}
        className="t-label"
        style={{
          flex: 1,
          height: 38,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          gap: 6,
          borderRadius: "var(--r-md)",
          border: "none",
          cursor: "pointer",
          background: active ? "var(--accent-soft)" : "transparent",
          color: active ? "var(--accent)" : "var(--text-muted)",
        }}
      >
        {label}
        {count > 0 && <Pill variant={active ? "accent" : "neutral"}>{count}</Pill>}
      </button>
    );
  };
  return (
    <div
      style={{
        display: "flex",
        gap: 4,
        padding: 4,
        background: "var(--surface)",
        border: "1px solid var(--border)",
        borderRadius: "var(--r-lg)",
      }}
    >
      {item("suggested", "Suggested", suggestedCount)}
      {item("settle", "Ready to settle", settleCount)}
    </div>
  );
}

// ─── Collapsible row shell with swipe (right = add, left = remove) ────
function Row({
  header,
  children,
  onSwipeRight,
  onSwipeLeft,
}: {
  header: (open: boolean) => React.ReactNode;
  children: React.ReactNode;
  /** right-drag commits the primary action (add/confirm) */
  onSwipeRight?: () => void;
  /** left-drag asks to remove (parent shows a confirm dialog) */
  onSwipeLeft?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const reduced = useReducedMotion();
  const x = useMotionValue(0);
  const swipeable = !reduced && (onSwipeRight != null || onSwipeLeft != null);

  // Reveal a green (add) panel when dragging right, red (remove) when left.
  const addOpacity = useTransform(x, [0, 100], [0, 1]);
  const removeOpacity = useTransform(x, [-100, 0], [1, 0]);

  function onDragEnd(_e: unknown, info: PanInfo) {
    if (onSwipeRight && (info.offset.x > 100 || info.velocity.x > 600))
      onSwipeRight();
    else if (onSwipeLeft && (info.offset.x < -100 || info.velocity.x < -600))
      onSwipeLeft();
  }

  return (
    <div
      style={{
        position: "relative",
        borderRadius: "var(--r-lg)",
        overflow: "hidden",
      }}
    >
      {/* action backgrounds revealed under the card while dragging */}
      {swipeable && (
        <>
          {onSwipeRight && (
            <motion.div
              style={{
                position: "absolute",
                inset: 0,
                background: "var(--accent)",
                color: "#0B0B0C",
                display: "flex",
                alignItems: "center",
                paddingLeft: 20,
                fontWeight: 700,
                opacity: addOpacity,
              }}
            >
              ＋ Add
            </motion.div>
          )}
          {onSwipeLeft && (
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
              Remove ✕
            </motion.div>
          )}
        </>
      )}

      <motion.div
        layout
        drag={swipeable ? "x" : false}
        dragConstraints={{ left: 0, right: 0 }}
        dragElastic={0.5}
        dragSnapToOrigin
        onDragEnd={onDragEnd}
        style={{
          x,
          position: "relative",
          background: "var(--surface)",
          border: "1px solid var(--border)",
          borderRadius: "var(--r-lg)",
          overflow: "hidden",
        }}
      >
        <button
          onClick={() => setOpen((o) => !o)}
          style={{
            width: "100%",
            border: "none",
            background: "transparent",
            color: "var(--text)",
            cursor: "pointer",
            padding: "12px 14px",
            textAlign: "left",
          }}
        >
          {header(open)}
        </button>
        <AnimatePresence initial={false}>
          {open && (
            <motion.div
              initial={reduced ? false : { height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={reduced ? { opacity: 0 } : { height: 0, opacity: 0 }}
              transition={{ duration: reduced ? 0.08 : 0.22 }}
              style={{ overflow: "hidden" }}
            >
              <div style={{ padding: "0 14px 14px" }}>{children}</div>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    </div>
  );
}

function Chevron({ open }: { open: boolean }) {
  return (
    <span
      style={{
        color: "var(--text-faint)",
        transform: open ? "rotate(180deg)" : "none",
        transition: "transform var(--dur-base) var(--ease-standard)",
        flexShrink: 0,
      }}
    >
      ⌄
    </span>
  );
}

// ─── Suggestion row ───────────────────────────────────────────────────
function SuggestionRow({
  s,
  currency,
  payerName,
  onAdd,
  onRequestRemove,
  onEdit,
  busy,
}: {
  s: SuggestionDto;
  currency: string;
  payerName: string;
  onAdd: () => void;
  onRequestRemove: () => void;
  onEdit: () => void;
  busy: boolean;
}) {
  return (
    <Row
      onSwipeRight={onAdd}
      onSwipeLeft={onRequestRemove}
      header={(open) => (
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div className="t-body-strong" style={ellip}>
              {s.description}
            </div>
            <div className="t-caption" style={{ color: "var(--text-muted)" }}>
              {payerName} paid · swipe → add, ← remove
            </div>
          </div>
          <Pill variant={s.tier === "normal" ? "accent" : "warn"}>
            {s.tier === "normal" ? "AI" : "low"}
          </Pill>
          <span className="t-body-strong">
            <Money value={s.amount ?? "0.00"} currency={currency} />
          </span>
          <Chevron open={open} />
        </div>
      )}
    >
      <div
        className="t-caption"
        style={{
          color: "var(--text-muted)",
          marginBottom: 12,
          paddingLeft: 10,
          borderLeft: "2px solid var(--border-strong)",
          fontStyle: "italic",
        }}
      >
        {s.reasoning} · split {s.splitWith.length}{" "}
        {s.splitWith.length === 1 ? "way" : "ways"}
      </div>
      <div style={{ display: "flex", gap: 8 }}>
        <Button variant="ghost" onClick={onRequestRemove} disabled={busy} style={{ flex: 1 }}>
          Remove
        </Button>
        <Button variant="ghost" onClick={onEdit} disabled={busy} style={{ flex: 1 }}>
          Edit
        </Button>
        <Button onClick={onAdd} disabled={busy} style={{ flex: 1 }}>
          ✓ Add
        </Button>
      </div>
    </Row>
  );
}

// ─── Settlement suggestion row (AI-detected payback) ─────────────────
function SettlementSuggestionRow({
  s,
  currency,
  fromName,
  toName,
  toTgId,
  onSettle,
  onDismiss,
  busy,
}: {
  s: SuggestionDto;
  currency: string;
  fromName: string;
  toName: string;
  toTgId?: string;
  onSettle: (amount?: string) => void;
  onDismiss: () => void;
  busy: boolean;
}) {
  return (
    <Row
      onSwipeRight={() => onSettle(s.amount ?? undefined)}
      onSwipeLeft={onDismiss}
      header={(open) => (
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <MemberAvatar name={toName} telegramUserId={toTgId} size={28} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div className="t-body-strong" style={ellip}>
              {fromName} paid {toName}
            </div>
            <div className="t-caption" style={{ color: "var(--text-muted)" }}>
              spotted in chat
            </div>
          </div>
          <Pill variant={s.tier === "normal" ? "accent" : "warn"}>AI</Pill>
          {s.amount && (
            <span className="t-body-strong">
              <Money value={s.amount} currency={currency} />
            </span>
          )}
          <Chevron open={open} />
        </div>
      )}
    >
      <div
        className="t-caption"
        style={{
          color: "var(--text-muted)",
          marginBottom: 12,
          paddingLeft: 10,
          borderLeft: "2px solid var(--border-strong)",
          fontStyle: "italic",
        }}
      >
        {s.reasoning}
      </div>
      <div style={{ display: "flex", gap: 8 }}>
        <Button variant="ghost" onClick={onDismiss} disabled={busy} style={{ flex: 1 }}>
          Remove
        </Button>
        <Button onClick={() => onSettle(s.amount ?? undefined)} style={{ flex: 1 }}>
          ✓ Settle
        </Button>
      </div>
    </Row>
  );
}

// ─── Settle row ───────────────────────────────────────────────────────
function SettleRow({
  t,
  currency,
  toName,
  toTgId,
  onSettle,
}: {
  t: TransferDto;
  currency: string;
  toName: string;
  toTgId?: string;
  onSettle: () => void;
}) {
  return (
    <Row
      header={(open) => (
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <MemberAvatar name={toName} telegramUserId={toTgId} size={32} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div className="t-body-strong" style={ellip}>
              Pay {toName}
            </div>
            <div className="t-caption" style={{ color: "var(--text-muted)" }}>
              you owe
            </div>
          </div>
          <span className="t-body-strong">
            <Money value={t.amount} currency={currency} />
          </span>
          <Chevron open={open} />
        </div>
      )}
    >
      <p className="t-caption" style={{ color: "var(--text-muted)", marginTop: 0 }}>
        Send {toName} <Money value={t.amount} currency={currency} /> off-platform,
        then confirm on the Settle screen.
      </p>
      <Button onClick={onSettle} style={{ width: "100%" }}>
        Go to Settle
      </Button>
    </Row>
  );
}

const ellip: React.CSSProperties = {
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
};

/** Current viewer's member id (matches the Settle screen logic). */
function currentMemberId(
  members: { id: string; telegramUserId: string }[],
): string | null {
  const wa = window.Telegram?.WebApp as
    | { initDataUnsafe?: { user?: { id?: number } } }
    | undefined;
  const tgId = wa?.initDataUnsafe?.user?.id;
  if (tgId == null) {
    return new URLSearchParams(window.location.search).get("me");
  }
  return members.find((m) => m.telegramUserId === String(tgId))?.id ?? null;
}
