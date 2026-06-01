import { useSearchParams, useNavigate } from "react-router-dom";
import { useGroup, useHistory } from "../lib/hooks.js";
import { Avatar, Money } from "../ui/primitives.js";
import { Centered } from "./Balances.js";

const rowButtonStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 12,
  minHeight: 56,
  padding: "0 4px",
  border: "none",
  background: "transparent",
  color: "var(--text)",
  cursor: "pointer",
  width: "100%",
};

const ellipsis: React.CSSProperties = {
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
};

export function History() {
  const [params, setParams] = useSearchParams();
  const nav = useNavigate();
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
              {d.items.map((item, idx) =>
                item.kind === "expense" ? (
                  <button
                    key={item.expense.id}
                    onClick={() => nav(`/expense/${item.expense.id}`)}
                    style={rowButtonStyle}
                  >
                    <Avatar name={nameOf(item.expense.payerMemberId)} size={24} />
                    <div style={{ flex: 1, minWidth: 0, textAlign: "left" }}>
                      <div className="t-body-strong" style={ellipsis}>
                        {item.expense.description}
                      </div>
                      <div className="t-caption" style={{ color: "var(--text-muted)" }}>
                        {nameOf(item.expense.payerMemberId)} paid · split{" "}
                        {item.expense.shares.length}{" "}
                        {item.expense.shares.length === 1 ? "way" : "ways"}
                      </div>
                    </div>
                    <Money value={item.expense.amount} currency={currency} />
                  </button>
                ) : (
                  <div key={`s-${idx}`} style={{ ...rowButtonStyle, cursor: "default" }}>
                    <Avatar name={nameOf(item.settlement.fromMemberId)} size={24} />
                    <span style={{ color: "var(--text-muted)" }}>→</span>
                    <Avatar name={nameOf(item.settlement.toMemberId)} size={24} />
                    <div style={{ flex: 1, minWidth: 0, textAlign: "left" }}>
                      <div className="t-body-strong" style={ellipsis}>
                        {nameOf(item.settlement.fromMemberId)} paid{" "}
                        {nameOf(item.settlement.toMemberId)}
                      </div>
                      <div className="t-caption" style={{ color: "var(--accent)" }}>
                        settled
                      </div>
                    </div>
                    <Money value={item.settlement.amount} currency={currency} />
                  </div>
                ),
              )}
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
