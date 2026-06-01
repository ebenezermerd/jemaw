import { useState } from "react";
import { useGroup, useSettlePlan, useMarkPaid } from "../lib/hooks.js";
import { Button, Avatar, Money } from "../ui/primitives.js";
import { Centered } from "./Balances.js";
import type { TransferDto } from "@jemaw/shared/types";

export function Settle() {
  const group = useGroup();
  const plan = useSettlePlan();
  const markPaid = useMarkPaid();
  const [confirming, setConfirming] = useState<TransferDto | null>(null);
  const [error, setError] = useState<string | null>(null);

  const me = currentMemberId(group.data?.members);
  const currency = group.data?.defaultCurrency ?? "EUR";
  const nameOf = (id: string) =>
    group.data?.members.find((m) => m.id === id)?.displayName ?? "Member";

  if (plan.isLoading) return <Centered>Loading…</Centered>;
  const transfers = plan.data?.transfers ?? [];
  if (transfers.length === 0) return <Centered>Everyone's even.</Centered>;

  async function confirmPaid() {
    if (!confirming) return;
    setError(null);
    try {
      await markPaid.mutateAsync(confirming.toMemberId);
      setConfirming(null);
    } catch (e) {
      // 409 stale → the plan refetches via invalidation; show a hint.
      setError("Balances changed — here's the updated plan.");
      setConfirming(null);
    }
  }

  return (
    <div style={{ padding: 16 }}>
      <h1 className="t-title" style={{ margin: "8px 0 4px" }}>
        Settle up
      </h1>
      <p className="t-body" style={{ color: "var(--text-muted)", marginTop: 0 }}>
        To zero everyone out:
      </p>

      {error && (
        <p className="t-caption" style={{ color: "var(--warn)" }}>
          {error}
        </p>
      )}

      <div style={{ display: "grid", gap: 8, marginTop: 12 }}>
        {transfers.map((t, i) => {
          const mine = me != null && t.fromMemberId === me;
          return (
            <div
              key={`${t.fromMemberId}-${t.toMemberId}-${i}`}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 12,
                padding: 12,
                borderRadius: "var(--r-lg)",
                border: "1px solid var(--border)",
                background: "var(--surface)",
              }}
            >
              <Avatar name={nameOf(t.fromMemberId)} size={28} />
              <span style={{ color: "var(--text-muted)" }}>→</span>
              <Avatar name={nameOf(t.toMemberId)} size={28} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div className="t-body-strong">
                  {nameOf(t.fromMemberId)} → {nameOf(t.toMemberId)}
                </div>
                <Money value={t.amount} currency={currency} />
              </div>
              {mine ? (
                <Button onClick={() => setConfirming(t)}>Mark as paid</Button>
              ) : (
                <span
                  className="t-caption"
                  style={{ color: "var(--text-faint)", maxWidth: 96, textAlign: "right" }}
                >
                  only {nameOf(t.fromMemberId)} can mark this
                </span>
              )}
            </div>
          );
        })}
      </div>

      {confirming && (
        <ConfirmSheet
          to={nameOf(confirming.toMemberId)}
          amount={confirming.amount}
          currency={currency}
          pending={markPaid.isPending}
          onConfirm={confirmPaid}
          onCancel={() => setConfirming(null)}
        />
      )}
    </div>
  );
}

/** Bottom-sheet confirmation (plan §13.6). The debtor confirms they sent money. */
function ConfirmSheet({
  to,
  amount,
  currency,
  pending,
  onConfirm,
  onCancel,
}: {
  to: string;
  amount: string;
  currency: string;
  pending: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <div
      onClick={onCancel}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.5)",
        display: "flex",
        alignItems: "flex-end",
        justifyContent: "center",
        zIndex: 50,
        animation: "jemaw-fade var(--dur-base) var(--ease-standard)",
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "100%",
          maxWidth: 560,
          background: "var(--surface)",
          borderTopLeftRadius: "var(--r-xl)",
          borderTopRightRadius: "var(--r-xl)",
          padding: 24,
          paddingBottom: "calc(24px + env(safe-area-inset-bottom))",
          boxShadow: "var(--shadow-sheet)",
          animation: "jemaw-slide-up var(--dur-base) var(--ease-standard)",
        }}
      >
        <h2 className="t-heading" style={{ marginTop: 0 }}>
          Confirm payment
        </h2>
        <p className="t-body" style={{ color: "var(--text-muted)" }}>
          Confirm you sent <Money value={amount} currency={currency} /> to {to}?
          This only records it — no money moves through Jemaw.
        </p>
        <div style={{ display: "flex", gap: 8, marginTop: 16 }}>
          <Button
            variant="ghost"
            onClick={onCancel}
            style={{ flex: 1 }}
          >
            Not yet
          </Button>
          <Button onClick={onConfirm} disabled={pending} style={{ flex: 1 }}>
            {pending ? "Saving…" : "Yes, mark paid"}
          </Button>
        </div>
      </div>
      <style>{`
        @keyframes jemaw-fade { from { opacity: 0 } to { opacity: 1 } }
        @keyframes jemaw-slide-up { from { transform: translateY(100%) } to { transform: translateY(0) } }
      `}</style>
    </div>
  );
}

/** The current Telegram user's member id, resolved from initData. */
function currentMemberId(
  members: { id: string; telegramUserId: string }[] | undefined,
): string | null {
  if (!members) return null;
  // Telegram WebApp exposes the user id in initDataUnsafe.
  const wa = window.Telegram?.WebApp as
    | { initDataUnsafe?: { user?: { id?: number } } }
    | undefined;
  const tgId = wa?.initDataUnsafe?.user?.id;
  if (tgId == null) {
    // Local dev fallback: ?me=<memberId> query override.
    return new URLSearchParams(window.location.search).get("me");
  }
  return members.find((m) => m.telegramUserId === String(tgId))?.id ?? null;
}
