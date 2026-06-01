import { useNavigate } from "react-router-dom";
import { useBalances, useGroup, useExpenses } from "../lib/hooks.js";
import { Money } from "../ui/primitives.js";
import { MemberAvatar } from "../ui/MemberAvatar.js";
import { SkeletonList } from "../motion/Skeleton.js";
import { Celebration } from "../motion/Celebration.js";
import { EmptyState } from "../ui/EmptyState.js";
import { BalancesAnalytics } from "../ui/BalancesAnalytics.js";

export function Balances() {
  const group = useGroup();
  const balances = useBalances();
  const expenses = useExpenses();
  const nav = useNavigate();

  if (balances.isLoading) return <SkeletonList />;
  if (balances.error) return <Centered>Couldn't load balances.</Centered>;

  const rows = balances.data ?? [];
  const allEven = rows.every((r) => Number(r.net) === 0);
  const hasActivity = (expenses.data?.length ?? 0) > 0;
  const currency = group.data?.defaultCurrency ?? "EUR";
  const members = group.data?.members ?? [];
  const tgId = (id: string) => members.find((m) => m.id === id)?.telegramUserId;

  if (rows.length === 0 || !hasActivity) {
    return (
      <div style={{ padding: 16 }}>
        <h1 className="t-screen-title" style={{ margin: "8px 0 0" }}>
          Balances
        </h1>
        <EmptyState
          icon="≡"
          title="Nothing to track yet"
          hint="Add an expense or say “jemaw” in the group to get started."
        />
      </div>
    );
  }

  return (
    <div style={{ padding: 16, display: "grid", gap: 18 }}>
      <h1 className="t-screen-title" style={{ margin: "8px 0 0" }}>
        Balances
      </h1>

      {allEven ? (
        <Centered>
          <Celebration text="Everyone's even." />
        </Centered>
      ) : (
        <div
          style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}
        >
          {rows.map((r) => {
            const n = Number(r.net);
            const positive = n > 0;
            const status = n === 0 ? "even" : positive ? "is owed" : "owes";
            return (
              <button
                key={r.memberId}
                onClick={() => nav(`/history?member=${r.memberId}`)}
                style={kpiCard}
              >
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    minWidth: 0,
                  }}
                >
                  <MemberAvatar
                    name={r.displayName}
                    telegramUserId={tgId(r.memberId)}
                    size={24}
                  />
                  <span className="t-label" style={ellipsis}>
                    {r.displayName}
                  </span>
                </div>
                <div className="t-heading" style={{ marginTop: 8 }}>
                  <Money value={r.net} currency={currency} signed animate />
                </div>
                <span
                  className="t-caption"
                  style={{
                    color: positive ? "var(--accent)" : "var(--warn)",
                    marginTop: 2,
                  }}
                >
                  {status}
                </span>
              </button>
            );
          })}
        </div>
      )}

      {/* analytics */}
      <BalancesAnalytics
        balances={rows}
        expenses={expenses.data ?? []}
        members={members}
        currency={currency}
      />
    </div>
  );
}

const kpiCard: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  alignItems: "flex-start",
  textAlign: "left",
  gap: 0,
  padding: 14,
  border: "1px solid var(--border)",
  background: "var(--surface)",
  borderRadius: "var(--r-lg)",
  color: "var(--text)",
  cursor: "pointer",
  width: "100%",
  minWidth: 0,
};

const ellipsis: React.CSSProperties = {
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
};

export function Centered({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        minHeight: "40vh",
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
