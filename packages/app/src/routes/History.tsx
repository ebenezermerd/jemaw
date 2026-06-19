import { useSearchParams, useNavigate } from "react-router-dom";
import { useGroup, useHistory } from "../lib/hooks.js";
import { Avatar, Money } from "../ui/primitives.js";
import { SkeletonList } from "../motion/Skeleton.js";
import { EmptyState } from "../ui/EmptyState.js";

/** Roomy card row: title/meta on top, amount on its own line — no clipping. */
const cardRow: React.CSSProperties = {
  display: "block",
  width: "100%",
  textAlign: "left",
  padding: 14,
  border: "1px solid var(--border)",
  background: "var(--surface)",
  borderRadius: "var(--r-lg)",
  color: "var(--text)",
  cursor: "pointer",
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

  if (history.isLoading) return <SkeletonList count={4} height={56} />;
  const days = history.data?.days ?? [];

  return (
    <div style={{ padding: 16, maxWidth: "100%" }}>
      <h1 className="t-screen-title" style={{ margin: "8px 0 12px" }}>
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
        <EmptyState
          compact
          icon="↻"
          title="Nothing here yet"
          hint="Expenses, loans, and settlements will appear in this timeline."
        />
      ) : (
        days.map((d) => (
          <section key={d.date} style={{ marginBottom: 20 }}>
            <p className="t-caption" style={{ color: "var(--text-faint)", margin: "0 0 8px" }}>
              {d.date}
            </p>
            <div style={{ display: "grid", gap: 8 }}>
              {d.items.map((item, idx) =>
                item.kind === "expense" ? (
                  <button
                    key={item.expense.id}
                    onClick={() => nav(`/expense/${item.expense.id}`)}
                    style={cardRow}
                  >
                    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                      <Avatar name={nameOf(item.expense.payerMemberId)} size={28} />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div className="t-body-strong" style={ellipsis}>
                          {item.expense.description}
                        </div>
                        <div className="t-caption" style={{ color: "var(--text-muted)" }}>
                          {item.expense.kind === "loan"
                            ? `${nameOf(item.expense.payerMemberId)} lent · ${nameOf(item.expense.shares[0]?.memberId ?? "")} owes`
                            : `${nameOf(item.expense.payerMemberId)} paid · split ${item.expense.shares.length}`}
                        </div>
                      </div>
                      {item.settled && <SettledBadge />}
                    </div>
                    <div
                      className="t-body-strong"
                      style={{ textAlign: "right", marginTop: 8 }}
                    >
                      <Money value={item.expense.amount} currency={currency} />
                    </div>
                  </button>
                ) : (
                  <div key={`s-${idx}`} style={{ ...cardRow, cursor: "default" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <Avatar name={nameOf(item.settlement.fromMemberId)} size={24} />
                      <span style={{ color: "var(--text-muted)" }}>→</span>
                      <Avatar name={nameOf(item.settlement.toMemberId)} size={24} />
                      <span className="t-label" style={{ ...ellipsis, marginLeft: 2 }}>
                        {nameOf(item.settlement.fromMemberId)} →{" "}
                        {nameOf(item.settlement.toMemberId)}
                      </span>
                    </div>
                    <div
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "baseline",
                        marginTop: 8,
                      }}
                    >
                      <span className="t-caption" style={{ color: "var(--accent)" }}>
                        {item.settled ? "fully settled" : "settled"}
                      </span>
                      <span className="t-body-strong">
                        <Money value={item.settlement.amount} currency={currency} />
                      </span>
                    </div>
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

function SettledBadge() {
  return (
    <span
      className="t-caption"
      style={{
        flexShrink: 0,
        padding: "2px 7px",
        borderRadius: "var(--r-full)",
        background: "var(--accent-soft)",
        color: "var(--accent)",
        fontSize: 11,
      }}
    >
      settled
    </span>
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
