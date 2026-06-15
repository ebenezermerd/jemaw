/**
 * Personal summary card for Home — a compact credit-card surface. Net standing
 * is focal; paid / share / items are a tidy stat row across the bottom. The
 * cardholder is a name badge (no avatar). Reduced height + tighter type.
 */
import { AnimatedNumber } from "../motion/AnimatedNumber.js";
import { currencyAffix, formatMoney, formatNumber } from "../lib/money.js";
import type { MeSummaryDto } from "@jemaw/shared/types";

export function SummaryCard({ s }: { s: MeSummaryDto }) {
  const net = Number(s.net);
  const standing =
    net > 0 ? "you're owed" : net < 0 ? "you owe" : "you're all square";
  const { symbol, suffix } = currencyAffix(s.currency);
  // Group thousands on the focal number (4,565.49) + keep the sign.
  const focal = net > 0 ? `+${formatNumber(s.net)}` : formatNumber(s.net);

  return (
    <div
      style={{
        position: "relative",
        borderRadius: "var(--r-xl)",
        padding: 18,
        overflow: "hidden",
        color: "#F7F7F5",
        background:
          "linear-gradient(135deg, color-mix(in srgb, var(--accent) 88%, #000) 0%, color-mix(in srgb, var(--accent) 34%, #0B0B0C) 56%, #0E0E10 100%)",
        border: "1px solid var(--border-strong)",
        boxShadow: "0 10px 28px rgba(0,0,0,0.28)",
        display: "grid",
        gap: 14,
      }}
    >
      {/* sheen + scrim */}
      <div
        aria-hidden
        style={{
          position: "absolute",
          inset: 0,
          background:
            "radial-gradient(130% 90% at 100% 0%, rgba(255,255,255,0.10) 0%, transparent 46%), radial-gradient(120% 90% at 0% 100%, rgba(0,0,0,0.32) 0%, transparent 56%)",
          pointerEvents: "none",
        }}
      />

      {/* top: name badge + chip */}
      <div
        style={{
          position: "relative",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
        }}
      >
        <span
          className="t-caption"
          style={{
            display: "inline-flex",
            alignItems: "center",
            height: 24,
            padding: "0 10px",
            borderRadius: "var(--r-full)",
            background: "rgba(255,255,255,0.16)",
            color: "#F7F7F5",
            textTransform: "uppercase",
            letterSpacing: "0.08em",
            fontWeight: 600,
            backdropFilter: "blur(4px)",
          }}
        >
          {s.displayName}
        </span>
        <Chip />
      </div>

      {/* focal: net */}
      <div style={{ position: "relative" }}>
        <div
          className="t-caption"
          style={{
            opacity: 0.82,
            marginBottom: 2,
            letterSpacing: "0.06em",
            textTransform: "uppercase",
          }}
        >
          {standing}
        </div>
        <div className="t-title" style={{ lineHeight: 1 }}>
          <AnimatedNumber
            value={focal}
            prefix={suffix ? "" : symbol}
            suffix={suffix ? symbol : ""}
          />
        </div>
      </div>

      {/* bottom: stat row */}
      <div
        style={{
          position: "relative",
          display: "grid",
          gridTemplateColumns: "1fr 1fr 1fr",
          borderTop: "1px solid rgba(255,255,255,0.16)",
          paddingTop: 12,
        }}
      >
        <Stat label="Paid" value={formatMoney(s.totalPaid, s.currency)} />
        <Stat label="Your share" value={formatMoney(s.totalShare, s.currency)} divider />
        <Stat label="Entries" value={String(s.expenseCount)} divider />
      </div>
    </div>
  );
}

function Stat({
  label,
  value,
  divider,
}: {
  label: string;
  value: string;
  divider?: boolean;
}) {
  return (
    <div
      style={{
        display: "grid",
        gap: 2,
        paddingLeft: divider ? 12 : 0,
        borderLeft: divider ? "1px solid rgba(255,255,255,0.16)" : "none",
      }}
    >
      <span
        className="tnum t-label"
        style={{ fontVariantNumeric: "tabular-nums" }}
      >
        {value}
      </span>
      <span className="t-caption" style={{ opacity: 0.7, fontSize: 11 }}>
        {label}
      </span>
    </div>
  );
}

function Chip() {
  return (
    <div
      aria-hidden
      style={{
        width: 32,
        height: 24,
        borderRadius: 5,
        background: "linear-gradient(135deg, #EBD98C, #C9A227)",
        position: "relative",
        boxShadow: "inset 0 1px 1px rgba(255,255,255,0.4)",
      }}
    >
      <div
        style={{
          position: "absolute",
          inset: "5px 8px",
          borderRadius: 2,
          border: "1px solid rgba(0,0,0,0.28)",
        }}
      />
      <div
        style={{
          position: "absolute",
          left: 8,
          right: 8,
          top: "50%",
          height: 1,
          background: "rgba(0,0,0,0.28)",
        }}
      />
    </div>
  );
}
