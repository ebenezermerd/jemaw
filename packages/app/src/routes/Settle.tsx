import { useState } from "react";
import { useGroup, useSettlePlan, useMarkPaid } from "../lib/hooks.js";
import { Button, Avatar, Money } from "../ui/primitives.js";
import { Sheet } from "../motion/Sheet.js";
import { Celebration } from "../motion/Celebration.js";
import { SkeletonList } from "../motion/Skeleton.js";
import { Centered } from "./Balances.js";
import type { TransferDto } from "@jemaw/shared/types";

const ellip: React.CSSProperties = {
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
};

/** Two small avatars overlapped into one compact pill (payer over payee). */
function DuoAvatar({ from, to }: { from: string; to: string }) {
  return (
    <span style={{ display: "inline-flex", alignItems: "center", flexShrink: 0 }}>
      <span style={{ marginRight: -8, zIndex: 1, borderRadius: "var(--r-full)", outline: "2px solid var(--surface)" }}>
        <Avatar name={from} size={26} />
      </span>
      <Avatar name={to} size={26} />
    </span>
  );
}

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

  if (plan.isLoading) return <SkeletonList count={3} height={72} />;
  const transfers = plan.data?.transfers ?? [];
  if (transfers.length === 0)
    return (
      <Centered>
        <Celebration text="Everyone's even." />
      </Centered>
    );

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
      <h1 className="t-screen-title" style={{ margin: "8px 0 4px" }}>
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
              {/* compact: overlapped avatars in a single pill */}
              <DuoAvatar
                from={nameOf(t.fromMemberId)}
                to={nameOf(t.toMemberId)}
              />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div className="t-label" style={ellip}>
                  {nameOf(t.fromMemberId)}{" "}
                  <span style={{ color: "var(--text-faint)" }}>→</span>{" "}
                  {nameOf(t.toMemberId)}
                </div>
                <div className="t-body-strong">
                  <Money value={t.amount} currency={currency} animate />
                </div>
              </div>
              {mine ? (
                <Button onClick={() => setConfirming(t)} style={{ flexShrink: 0 }}>
                  Pay
                </Button>
              ) : (
                <span
                  className="t-caption"
                  style={{ color: "var(--text-faint)", maxWidth: 84, textAlign: "right", flexShrink: 0 }}
                >
                  {nameOf(t.fromMemberId)} pays
                </span>
              )}
            </div>
          );
        })}
      </div>

      <Sheet open={confirming != null} onClose={() => setConfirming(null)}>
        {confirming && (
          <>
            <h2 className="t-heading" style={{ marginTop: 0 }}>
              Confirm payment
            </h2>
            <p className="t-body" style={{ color: "var(--text-muted)" }}>
              Confirm you sent{" "}
              <Money value={confirming.amount} currency={currency} /> to{" "}
              {nameOf(confirming.toMemberId)}? This only records it — no money
              moves through Jemaw.
            </p>
            <div style={{ display: "flex", gap: 8, marginTop: 16 }}>
              <Button
                variant="ghost"
                onClick={() => setConfirming(null)}
                style={{ flex: 1 }}
              >
                Not yet
              </Button>
              <Button
                onClick={confirmPaid}
                disabled={markPaid.isPending}
                style={{ flex: 1 }}
              >
                {markPaid.isPending ? "Saving…" : "Yes, mark paid"}
              </Button>
            </div>
          </>
        )}
      </Sheet>
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
