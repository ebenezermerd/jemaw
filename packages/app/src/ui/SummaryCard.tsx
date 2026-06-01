/**
 * Personal summary card for Home — a refined credit-card surface. Net standing
 * is focal; paid / share / items are organized as a clean stat row across the
 * bottom. No issuer/label chrome — just the chip, the balance, and the stats.
 */
import { AnimatedNumber } from "../motion/AnimatedNumber.js";
import { currencyAffix, formatMoney } from "../lib/money.js";
import { currentPhotoUrl } from "../telegram.js";
import type { MeSummaryDto } from "@jemaw/shared/types";

export function SummaryCard({ s }: { s: MeSummaryDto }) {
  const net = Number(s.net);
  const standing =
    net > 0 ? "you're owed" : net < 0 ? "you owe" : "you're all square";
  const { symbol, suffix } = currencyAffix(s.currency);
  const focal = net > 0 ? `+${s.net}` : s.net;
  const photo = currentPhotoUrl();

  return (
    <div
      style={{
        position: "relative",
        borderRadius: "var(--r-xl)",
        padding: 22,
        overflow: "hidden",
        color: "#F7F7F5",
        background:
          "linear-gradient(135deg, color-mix(in srgb, var(--accent) 88%, #000) 0%, color-mix(in srgb, var(--accent) 36%, #0B0B0C) 54%, #0E0E10 100%)",
        border: "1px solid var(--border-strong)",
        boxShadow: "0 12px 32px rgba(0,0,0,0.30)",
        display: "grid",
        gap: 18,
      }}
    >
      {/* sheen + scrim for legibility */}
      <div
        aria-hidden
        style={{
          position: "absolute",
          inset: 0,
          background:
            "radial-gradient(130% 90% at 100% 0%, rgba(255,255,255,0.10) 0%, transparent 46%), radial-gradient(120% 90% at 0% 100%, rgba(0,0,0,0.34) 0%, transparent 56%)",
          pointerEvents: "none",
        }}
      />

      {/* top: cardholder (with photo) + chip */}
      <div
        style={{
          position: "relative",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          {photo && (
            <img
              src={photo}
              alt=""
              width={30}
              height={30}
              style={{
                width: 30,
                height: 30,
                borderRadius: "var(--r-full)",
                objectFit: "cover",
                border: "1px solid rgba(255,255,255,0.45)",
              }}
            />
          )}
          <span
            className="t-label"
            style={{ textTransform: "uppercase", letterSpacing: "0.1em", opacity: 0.95 }}
          >
            {s.displayName}
          </span>
        </div>
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
        <div className="t-display" style={{ lineHeight: 1 }}>
          <AnimatedNumber
            value={focal}
            prefix={suffix ? "" : symbol}
            suffix={suffix ? symbol : ""}
          />
        </div>
      </div>

      {/* bottom: stat row, organized with dividers */}
      <div
        style={{
          position: "relative",
          display: "grid",
          gridTemplateColumns: "1fr 1fr 1fr",
          borderTop: "1px solid rgba(255,255,255,0.16)",
          paddingTop: 14,
        }}
      >
        <Stat label="Paid" value={formatMoney(s.totalPaid, s.currency)} />
        <Stat label="Your share" value={formatMoney(s.totalShare, s.currency)} divider />
        <Stat label="Expenses" value={String(s.expenseCount)} divider />
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
        gap: 3,
        paddingLeft: divider ? 14 : 0,
        borderLeft: divider ? "1px solid rgba(255,255,255,0.16)" : "none",
      }}
    >
      <span
        className="tnum t-body-strong"
        style={{ fontVariantNumeric: "tabular-nums" }}
      >
        {value}
      </span>
      <span className="t-caption" style={{ opacity: 0.72 }}>
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
        width: 36,
        height: 27,
        borderRadius: 6,
        background: "linear-gradient(135deg, #EBD98C, #C9A227)",
        position: "relative",
        boxShadow: "inset 0 1px 1px rgba(255,255,255,0.4)",
      }}
    >
      <div
        style={{
          position: "absolute",
          inset: "6px 9px",
          borderRadius: 2,
          border: "1px solid rgba(0,0,0,0.28)",
        }}
      />
      <div
        style={{
          position: "absolute",
          left: 9,
          right: 9,
          top: "50%",
          height: 1,
          background: "rgba(0,0,0,0.28)",
        }}
      />
    </div>
  );
}
