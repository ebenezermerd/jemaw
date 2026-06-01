import { useNavigate } from "react-router-dom";
import { useBalances, useGroup, useMeSummary } from "../lib/hooks.js";
import { Money } from "../ui/primitives.js";
import { MemberAvatar } from "../ui/MemberAvatar.js";
import { SkeletonList } from "../motion/Skeleton.js";
import { Celebration } from "../motion/Celebration.js";
import { formatMoney } from "../lib/money.js";

export function Balances() {
  const group = useGroup();
  const balances = useBalances();
  const me = useMeSummary();
  const nav = useNavigate();

  if (balances.isLoading) return <SkeletonList />;
  if (balances.error) return <Centered>Couldn't load balances.</Centered>;

  const rows = balances.data ?? [];
  const allEven = rows.every((r) => Number(r.net) === 0);
  const currency = group.data?.defaultCurrency ?? "EUR";
  const members = group.data?.members ?? [];
  const tgId = (id: string) =>
    members.find((m) => m.id === id)?.telegramUserId;

  // Bars are scaled to the largest absolute net so they read at a glance.
  const maxAbs = Math.max(1, ...rows.map((r) => Math.abs(Number(r.net))));

  return (
    <div style={{ padding: 16, display: "grid", gap: 16 }}>
      {/* title + your mini-stats on the right */}
      <div
        style={{
          display: "flex",
          alignItems: "flex-start",
          justifyContent: "space-between",
          gap: 12,
        }}
      >
        <h1 className="t-screen-title" style={{ margin: "8px 0 0" }}>
          Balances
        </h1>
        {me.data && (
          <div style={{ display: "flex", gap: 14, paddingTop: 10 }}>
            <MiniStat label="Paid" value={formatMoney(me.data.totalPaid, currency)} />
            <MiniStat label="Share" value={formatMoney(me.data.totalShare, currency)} />
            <MiniStat label="Items" value={String(me.data.expenseCount)} />
          </div>
        )}
      </div>

      {allEven ? (
        <Centered>
          <Celebration text="Everyone's even." />
        </Centered>
      ) : rows.length === 0 ? (
        <Centered>Nothing to track yet.</Centered>
      ) : (
        <div style={{ display: "grid", gap: 6 }}>
          {rows.map((r) => {
            const n = Number(r.net);
            const pct = Math.round((Math.abs(n) / maxAbs) * 100);
            const positive = n > 0;
            return (
              <button
                key={r.memberId}
                onClick={() => nav(`/history?member=${r.memberId}`)}
                style={rowStyle}
              >
                <MemberAvatar
                  name={r.displayName}
                  telegramUserId={tgId(r.memberId)}
                  size={32}
                />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "baseline",
                    }}
                  >
                    <span className="t-body-strong">{r.displayName}</span>
                    <Money value={r.net} currency={currency} signed animate />
                  </div>
                  {/* net bar */}
                  <div
                    style={{
                      height: 4,
                      marginTop: 6,
                      borderRadius: "var(--r-full)",
                      background: "var(--surface-elevated)",
                      overflow: "hidden",
                    }}
                  >
                    <div
                      style={{
                        width: `${pct}%`,
                        height: "100%",
                        borderRadius: "var(--r-full)",
                        background: positive ? "var(--accent)" : "var(--warn)",
                        transition: "width var(--dur-base) var(--ease-standard)",
                      }}
                    />
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ textAlign: "right" }}>
      <div className="tnum t-label" style={{ fontVariantNumeric: "tabular-nums" }}>
        {value}
      </div>
      <div className="t-caption" style={{ color: "var(--text-faint)" }}>
        {label}
      </div>
    </div>
  );
}

const rowStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 12,
  padding: "10px 12px",
  border: "none",
  background: "transparent",
  borderRadius: "var(--r-md)",
  color: "var(--text)",
  cursor: "pointer",
  width: "100%",
  textAlign: "left",
};

export function Centered({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        height: "60vh",
        display: "grid",
        placeItems: "center",
        color: "var(--text-muted)",
      }}
      className="t-body"
    >
      {children}
    </div>
  );
}
