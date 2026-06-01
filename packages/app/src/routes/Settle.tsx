import { useNavigate } from "react-router-dom";
import { useGroup, useSettlePlan } from "../lib/hooks.js";
import { Avatar, Money } from "../ui/primitives.js";
import { Celebration } from "../motion/Celebration.js";
import { SkeletonList } from "../motion/Skeleton.js";
import { Centered } from "./Balances.js";

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
  const nav = useNavigate();

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

  return (
    <div style={{ padding: 16 }}>
      <h1 className="t-screen-title" style={{ margin: "8px 0 4px" }}>
        Settle up
      </h1>
      <p className="t-body" style={{ color: "var(--text-muted)", marginTop: 0 }}>
        Tap a line to record the payment.
      </p>

      <div style={{ display: "grid", gap: 8, marginTop: 12 }}>
        {transfers.map((t, i) => (
          <button
            key={`${t.fromMemberId}-${t.toMemberId}-${i}`}
            onClick={() =>
              nav(
                `/settle/new?from=${t.fromMemberId}&to=${t.toMemberId}&amount=${t.amount}`,
              )
            }
            style={{
              display: "flex",
              alignItems: "center",
              gap: 12,
              padding: 12,
              borderRadius: "var(--r-lg)",
              border: "1px solid var(--border)",
              background: "var(--surface)",
              color: "var(--text)",
              cursor: "pointer",
              textAlign: "left",
              width: "100%",
            }}
          >
            <DuoAvatar from={nameOf(t.fromMemberId)} to={nameOf(t.toMemberId)} />
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
            <span style={{ color: "var(--text-faint)", flexShrink: 0 }}>›</span>
          </button>
        ))}
      </div>
    </div>
  );
}
