import { useNavigate } from "react-router-dom";
import { useGroup, useSettlePlan, useBalances } from "../lib/hooks.js";
import { settleFormSearchParams } from "../lib/settleLink.js";
import { Avatar, Money } from "../ui/primitives.js";
import { MemberAvatar } from "../ui/MemberAvatar.js";
import { SkeletonList } from "../motion/Skeleton.js";
import { memberDisplayName, formatDisplayName } from "../lib/names.js";

const ellip: React.CSSProperties = {
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
};

const evenRow: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 12,
  padding: 14,
  border: "1px solid var(--border)",
  background: "var(--surface)",
  borderRadius: "var(--r-lg)",
  width: "100%",
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
  const balances = useBalances();
  const nav = useNavigate();

  const currency = group.data?.defaultCurrency ?? "EUR";
  const members = group.data?.members ?? [];
  const tgId = (id: string) => members.find((m) => m.id === id)?.telegramUserId;
  const nameOf = (id: string) => memberDisplayName(members, id);

  if (plan.isLoading) return <SkeletonList count={3} height={72} />;
  const transfers = plan.data?.transfers ?? [];

  // Even — show the current per member standing (all settled) rather than a bare
  // celebration, so the page still reflects the group's state.
  if (transfers.length === 0) {
    const rows = balances.data ?? [];
    return (
      <div style={{ padding: 16, display: "grid", gap: 14 }}>
        <h1 className="t-screen-title" style={{ margin: "8px 0 0" }}>
          Settle up
        </h1>
        <p className="t-caption" style={{ color: "var(--positive)", margin: 0 }}>
          ✓ All settled up — everyone's even.
        </p>
        <div style={{ display: "grid", gap: 8 }}>
          {rows.map((r) => (
            <div key={r.memberId} style={evenRow}>
              <MemberAvatar
                name={formatDisplayName(r.displayName)}
                telegramUserId={tgId(r.memberId)}
                size={36}
              />
              <div className="t-body-strong" style={{ flex: 1, minWidth: 0, ...ellip }}>
                {formatDisplayName(r.displayName)}
              </div>
              <div className="t-heading" style={{ flexShrink: 0 }}>
                <Money value={r.net} currency={currency} signed />
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

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
              nav(`/settle/new?${settleFormSearchParams(t)}`)
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
