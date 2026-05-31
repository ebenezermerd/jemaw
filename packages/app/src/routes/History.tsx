import { useSearchParams } from "react-router-dom";
import { useGroup, useHistory } from "../lib/hooks.js";
import { Avatar, Money } from "../ui/primitives.js";
import { Centered } from "./Balances.js";

export function History() {
  const [params, setParams] = useSearchParams();
  const memberFilter = params.get("member") ?? undefined;
  const group = useGroup();
  const history = useHistory(memberFilter);

  const currency = group.data?.defaultCurrency ?? "EUR";
  const members = group.data?.members ?? [];
  const nameOf = (id: string) =>
    members.find((m) => m.id === id)?.displayName ?? "Member";

  if (history.isLoading) return <Centered>Loading…</Centered>;
  const days = history.data?.days ?? [];

  return (
    <div style={{ padding: 16 }}>
      <h1 className="t-title" style={{ margin: "8px 0 12px" }}>
        History
      </h1>

      <div style={{ display: "flex", gap: 8, marginBottom: 16, flexWrap: "wrap" }}>
        <FilterChip
          active={!memberFilter}
          onClick={() => setParams({})}
          label="All"
        />
        {members.map((m) => (
          <FilterChip
            key={m.id}
            active={memberFilter === m.id}
            onClick={() => setParams({ member: m.id })}
            label={m.displayName}
          />
        ))}
      </div>

      {days.length === 0 ? (
        <Centered>Nothing here yet.</Centered>
      ) : (
        days.map((d) => (
          <section key={d.date} style={{ marginBottom: 20 }}>
            <p className="t-caption" style={{ color: "var(--text-faint)", margin: "0 0 8px" }}>
              {d.date}
            </p>
            <div style={{ display: "grid", gap: 2 }}>
              {d.expenses.map((e) => (
                <div
                  key={e.id}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 12,
                    height: 56,
                    padding: "0 4px",
                  }}
                >
                  <Avatar name={nameOf(e.payerMemberId)} size={24} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div className="t-body-strong" style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {e.description}
                    </div>
                    <div className="t-caption" style={{ color: "var(--text-muted)" }}>
                      {nameOf(e.payerMemberId)} paid · split {e.shares.length}{" "}
                      {e.shares.length === 1 ? "way" : "ways"}
                    </div>
                  </div>
                  <Money value={e.amount} currency={currency} />
                </div>
              ))}
            </div>
          </section>
        ))
      )}
    </div>
  );
}

function FilterChip({
  active,
  onClick,
  label,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
}) {
  return (
    <button
      onClick={onClick}
      className="t-label"
      style={{
        height: 32,
        padding: "0 12px",
        borderRadius: "var(--r-full)",
        border: active ? "1px solid var(--accent)" : "1px solid var(--border-strong)",
        background: active ? "var(--accent-soft)" : "transparent",
        color: active ? "var(--accent)" : "var(--text-muted)",
        cursor: "pointer",
      }}
    >
      {label}
    </button>
  );
}
