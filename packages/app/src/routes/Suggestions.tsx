import { useNavigate } from "react-router-dom";
import {
  useGroup,
  useSuggestions,
  useConfirmSuggestion,
  useDismissSuggestion,
} from "../lib/hooks.js";
import { Button, Money, Pill } from "../ui/primitives.js";
import { Centered } from "./Balances.js";
import type { SuggestionDto } from "@jemaw/shared/types";

export function Suggestions() {
  const group = useGroup();
  const q = useSuggestions();
  const confirm = useConfirmSuggestion();
  const dismiss = useDismissSuggestion();
  const nav = useNavigate();

  const currency = group.data?.defaultCurrency ?? "EUR";
  const nameOf = (id: string | null) =>
    id ? group.data?.members.find((m) => m.id === id)?.displayName ?? "Member" : "someone";

  if (q.isLoading) return <Centered>Loading…</Centered>;
  const list = q.data?.suggestions ?? [];

  if (list.length === 0) {
    return (
      <Centered>
        <div style={{ textAlign: "center" }}>
          <div>Caught up.</div>
          <div className="t-caption" style={{ color: "var(--text-faint)", marginTop: 8 }}>
            Say "jemaw" in the group to scan the chat.
          </div>
        </div>
      </Centered>
    );
  }

  return (
    <div style={{ padding: 16, display: "grid", gap: 12 }}>
      <h1 className="t-title" style={{ margin: "8px 0 0" }}>
        Suggestions
      </h1>
      {list.map((s) => (
        <Card
          key={s.id}
          s={s}
          currency={currency}
          payerName={nameOf(s.payerMemberId)}
          onAdd={() => confirm.mutate(s.id)}
          onDismiss={() => dismiss.mutate(s.id)}
          onEdit={() => nav(`/add?from=${s.id}`)}
          busy={confirm.isPending || dismiss.isPending}
        />
      ))}
    </div>
  );
}

function Card({
  s,
  currency,
  payerName,
  onAdd,
  onDismiss,
  onEdit,
  busy,
}: {
  s: SuggestionDto;
  currency: string;
  payerName: string;
  onAdd: () => void;
  onDismiss: () => void;
  onEdit: () => void;
  busy: boolean;
}) {
  const strip = s.tier === "normal" ? "var(--accent-soft)" : "var(--warn-soft)";
  return (
    <div
      style={{
        position: "relative",
        background: "var(--surface)",
        border: "1px solid var(--border)",
        borderRadius: "var(--r-lg)",
        padding: 16,
        paddingLeft: 20,
        overflow: "hidden",
      }}
    >
      <span style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: 4, background: strip }} />

      <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
        <span className="t-body-strong">{s.description}</span>
        <Money value={s.amount} currency={currency} />
      </div>

      <div className="t-caption" style={{ color: "var(--text-muted)", marginTop: 4 }}>
        {payerName} paid · split {s.splitWith.length}{" "}
        {s.splitWith.length === 1 ? "way" : "ways"}
        {s.tier === "low" && (
          <>
            {" · "}
            <Pill variant="warn">low confidence</Pill>
          </>
        )}
      </div>

      <div className="t-caption" style={{ color: "var(--text-faint)", marginTop: 8, fontStyle: "italic" }}>
        {s.reasoning}
      </div>

      <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
        <Button variant="ghost" onClick={onDismiss} disabled={busy} style={{ flex: 1 }}>
          Dismiss
        </Button>
        <Button variant="ghost" onClick={onEdit} disabled={busy} style={{ flex: 1 }}>
          Edit
        </Button>
        <Button onClick={onAdd} disabled={busy} style={{ flex: 1 }}>
          ✓ Add
        </Button>
      </div>
    </div>
  );
}
