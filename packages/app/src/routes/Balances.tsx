import { useNavigate } from "react-router-dom";
import { useBalances, useGroup } from "../lib/hooks.js";
import { Money } from "../ui/primitives.js";

export function Balances() {
  const group = useGroup();
  const balances = useBalances();
  const nav = useNavigate();

  if (balances.isLoading) return <Skeleton />;
  if (balances.error)
    return <Centered>Couldn't load balances.</Centered>;

  const rows = balances.data ?? [];
  const allEven = rows.every((r) => Number(r.net) === 0);
  const currency = group.data?.defaultCurrency ?? "EUR";

  if (rows.length === 0)
    return <Centered>Nothing to track yet.</Centered>;
  if (allEven) return <Centered>Everyone's even.</Centered>;

  return (
    <div style={{ padding: 16, display: "grid", gap: 4 }}>
      <h1 className="t-title" style={{ margin: "8px 0 16px" }}>
        Balances
      </h1>
      {rows.map((r) => (
        <button
          key={r.memberId}
          onClick={() => nav(`/history?member=${r.memberId}`)}
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            height: 56,
            padding: "0 12px",
            border: "none",
            background: "transparent",
            borderRadius: "var(--r-md)",
            color: "var(--text)",
            cursor: "pointer",
            transition: "background var(--dur-fast)",
          }}
          onMouseEnter={(e) =>
            (e.currentTarget.style.background = "var(--surface-elevated)")
          }
          onMouseLeave={(e) =>
            (e.currentTarget.style.background = "transparent")
          }
        >
          <span className="t-body-strong">{r.displayName}</span>
          <Money value={r.net} currency={currency} signed />
        </button>
      ))}
    </div>
  );
}

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

function Skeleton() {
  return (
    <div style={{ padding: 16, display: "grid", gap: 8 }}>
      {[0, 1, 2].map((i) => (
        <div
          key={i}
          style={{
            height: 56,
            borderRadius: "var(--r-md)",
            background:
              "linear-gradient(90deg, var(--surface) 0%, var(--surface-elevated) 50%, var(--surface) 100%)",
            backgroundSize: "200% 100%",
            animation: "jemaw-shimmer 1.2s linear infinite",
          }}
        />
      ))}
      <style>{`@keyframes jemaw-shimmer { from { background-position: 200% 0 } to { background-position: -200% 0 } }`}</style>
    </div>
  );
}
