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
import { Skeleton } from "../motion/Skeleton.js";
import { useReducedMotion } from "../motion/useReducedMotion.js";
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

  const sugg = suggestions.data?.suggestions ?? [];
  const transfers = (settle.data?.transfers ?? []).filter(
    (t) => me != null && t.fromMemberId === me,
  );

  // Default to whichever tab has items (prefer Suggested).
  const [tab, setTab] = useState<Tab>("suggested");
  useEffect(() => {
    if (sugg.length === 0 && transfers.length > 0) setTab("settle");
    else if (sugg.length > 0) setTab("suggested");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sugg.length, transfers.length]);

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
          settleCount={transfers.length}
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
                  onDismiss={() => dismiss.mutate(s.id)}
                  onEdit={() => nav(`/add?from=${s.id}`)}
                  busy={confirm.isPending || dismiss.isPending}
                />
              ))}
            </div>
          )
        ) : transfers.length === 0 ? (
          <EmptyState
            compact
            icon="⇄"
            title="Nothing to settle"
            hint="When you owe someone, the transfer shows up here."
          />
        ) : (
          <div style={{ display: "grid", gap: 8 }}>
            {transfers.map((t, i) => (
              <SettleRow
                key={`${t.toMemberId}-${i}`}
                t={t}
                currency={currency}
                toName={nameOf(t.toMemberId)}
                toTgId={tgId(t.toMemberId)}
                onSettle={() => nav("/settle")}
              />
            ))}
          </div>
        )}
      </div>
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

// ─── Collapsible row shell ────────────────────────────────────────────
function Row({
  header,
  children,
}: {
  header: (open: boolean) => React.ReactNode;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const reduced = useReducedMotion();
  return (
    <div
      style={{
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
  onDismiss,
  onEdit,
  busy,
}: {
  s: SuggestionDto;
  currency: string;
  payerName: string;
  onAdd: () => void;
  onDismiss: () => void;
  onEdit: () => void;
  busy: boolean;
}) {
  return (
    <Row
      header={(open) => (
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div className="t-body-strong" style={ellip}>
              {s.description}
            </div>
            <div className="t-caption" style={{ color: "var(--text-muted)" }}>
              {payerName} paid
            </div>
          </div>
          <Pill variant={s.tier === "normal" ? "accent" : "warn"}>
            {s.tier === "normal" ? "AI" : "low"}
          </Pill>
          <span className="t-body-strong">
            <Money value={s.amount} currency={currency} />
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
