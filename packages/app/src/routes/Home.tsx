/**
 * Home: the personal summary card, then collapsible "things Jemaw noticed" —
 * AI-suggested expenses to add and ready-to-settle transfers — as a tidy
 * expandable list. Empty groups stay quiet.
 */
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { AnimatePresence, motion } from "framer-motion";
import {
  useMeSummary,
  useGroup,
  useSuggestions,
  useSettlePlan,
  useConfirmSuggestion,
  useDismissSuggestion,
  useMarkPaid,
} from "../lib/hooks.js";
import { SummaryCard } from "../ui/SummaryCard.js";
import { MemberAvatar } from "../ui/MemberAvatar.js";
import { Money, Pill } from "../ui/primitives.js";
import { Skeleton } from "../motion/Skeleton.js";
import { useReducedMotion } from "../motion/useReducedMotion.js";

export function Home() {
  const summary = useMeSummary();
  const group = useGroup();
  const suggestions = useSuggestions();
  const settle = useSettlePlan();
  const confirm = useConfirmSuggestion();
  const dismiss = useDismissSuggestion();
  const markPaid = useMarkPaid();
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

  return (
    <div style={{ paddingBottom: 8 }}>
      <div style={{ padding: 16, paddingBottom: 8 }}>
        {summary.isLoading || !summary.data ? (
          <Skeleton height={196} radius="var(--r-xl)" />
        ) : (
          <SummaryCard s={summary.data} />
        )}
      </div>

      <div style={{ padding: "0 16px", display: "grid", gap: 12 }}>
        <Accordion
          title="Suggested expenses"
          count={sugg.length}
          emptyText="No new suggestions. Say “jemaw” in the group."
          defaultOpen={sugg.length > 0}
        >
          {sugg.map((s) => (
            <ActionRow
              key={s.id}
              title={s.description}
              subtitle={`${nameOf(s.payerMemberId)} paid · split ${s.splitWith.length}`}
              right={<Money value={s.amount} currency={currency} />}
              badge={
                <Pill variant={s.tier === "normal" ? "accent" : "warn"}>
                  {s.tier === "normal" ? "AI" : "low"}
                </Pill>
              }
              actionLabel="Add"
              onAction={() => confirm.mutate(s.id)}
              onSecondary={() => dismiss.mutate(s.id)}
              secondaryLabel="Dismiss"
              onTap={() => nav(`/add?from=${s.id}`)}
              busy={confirm.isPending || dismiss.isPending}
            />
          ))}
        </Accordion>

        <Accordion
          title="Ready to settle"
          count={transfers.length}
          emptyText="Nothing for you to pay right now."
          defaultOpen={false}
        >
          {transfers.map((t, i) => (
            <ActionRow
              key={`${t.toMemberId}-${i}`}
              avatar={
                <MemberAvatar name={nameOf(t.toMemberId)} telegramUserId={tgId(t.toMemberId)} size={32} />
              }
              title={`Pay ${nameOf(t.toMemberId)}`}
              subtitle="tap Settle to confirm"
              right={<Money value={t.amount} currency={currency} />}
              actionLabel="Settle"
              onAction={() => nav("/settle")}
              busy={markPaid.isPending}
            />
          ))}
        </Accordion>
      </div>

      {sugg.length === 0 && transfers.length === 0 && !summary.isLoading && (
        <p
          className="t-caption"
          style={{ color: "var(--text-faint)", textAlign: "center", marginTop: 16 }}
        >
          All caught up.
        </p>
      )}
    </div>
  );
}

function Accordion({
  title,
  count,
  emptyText,
  defaultOpen,
  children,
}: {
  title: string;
  count: number;
  emptyText: string;
  defaultOpen: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const reduced = useReducedMotion();

  return (
    <section
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
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 8,
          padding: "14px 16px",
          border: "none",
          background: "transparent",
          color: "var(--text)",
          cursor: "pointer",
        }}
      >
        <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span className="t-body-strong">{title}</span>
          {count > 0 && <Pill variant="accent">{count}</Pill>}
        </span>
        <span
          style={{
            color: "var(--text-muted)",
            transform: open ? "rotate(180deg)" : "none",
            transition: "transform var(--dur-base) var(--ease-standard)",
          }}
        >
          ⌄
        </span>
      </button>

      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={reduced ? false : { height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={reduced ? { opacity: 0 } : { height: 0, opacity: 0 }}
            transition={{ duration: reduced ? 0.08 : 0.24 }}
            style={{ overflow: "hidden" }}
          >
            <div style={{ padding: "0 12px 8px" }}>
              {count === 0 ? (
                <p
                  className="t-caption"
                  style={{ color: "var(--text-faint)", padding: "4px 4px 8px" }}
                >
                  {emptyText}
                </p>
              ) : (
                <div style={{ display: "grid", gap: 4 }}>{children}</div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </section>
  );
}

function ActionRow({
  title,
  subtitle,
  right,
  badge,
  avatar,
  actionLabel,
  onAction,
  secondaryLabel,
  onSecondary,
  onTap,
  busy,
}: {
  title: string;
  subtitle: string;
  right: React.ReactNode;
  badge?: React.ReactNode;
  avatar?: React.ReactNode;
  actionLabel: string;
  onAction: () => void;
  secondaryLabel?: string;
  onSecondary?: () => void;
  onTap?: () => void;
  busy: boolean;
}) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 10,
        padding: "8px 8px",
        borderRadius: "var(--r-md)",
      }}
    >
      {avatar}
      <button
        onClick={onTap}
        disabled={!onTap}
        style={{
          flex: 1,
          minWidth: 0,
          textAlign: "left",
          border: "none",
          background: "transparent",
          color: "var(--text)",
          cursor: onTap ? "pointer" : "default",
          padding: 0,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <span className="t-body-strong" style={ellip}>
            {title}
          </span>
          {badge}
        </div>
        <div className="t-caption" style={{ color: "var(--text-muted)" }}>
          {subtitle}
        </div>
      </button>
      <span className="t-label">{right}</span>
      {secondaryLabel && onSecondary && (
        <button onClick={onSecondary} disabled={busy} style={ghostBtn}>
          {secondaryLabel}
        </button>
      )}
      <button onClick={onAction} disabled={busy} style={primaryBtn}>
        {actionLabel}
      </button>
    </div>
  );
}

const ellip: React.CSSProperties = {
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
};

const primaryBtn: React.CSSProperties = {
  height: 32,
  padding: "0 12px",
  borderRadius: "var(--r-sm)",
  border: "none",
  background: "var(--accent)",
  color: "#0B0B0C",
  fontSize: 13,
  fontWeight: 600,
  cursor: "pointer",
  flexShrink: 0,
};

const ghostBtn: React.CSSProperties = {
  height: 32,
  padding: "0 10px",
  borderRadius: "var(--r-sm)",
  border: "1px solid var(--border-strong)",
  background: "transparent",
  color: "var(--text-muted)",
  fontSize: 13,
  cursor: "pointer",
  flexShrink: 0,
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
