/**
 * Personal summary card for Home — a credit-card-style surface showing the
 * member's net standing as the focal number, with paid/share/count stats.
 * On-brand (Jemaw green) gradient; no fake card number.
 */
import { AnimatedNumber } from "../motion/AnimatedNumber.js";
import type { MeSummaryDto } from "@jemaw/shared/types";

function symbolFor(currency: string): string {
  const map: Record<string, string> = {
    EUR: "€",
    USD: "$",
    GBP: "£",
    JPY: "¥",
    ETB: "Br ",
  };
  return map[currency] ?? `${currency} `;
}

export function SummaryCard({ s }: { s: MeSummaryDto }) {
  const net = Number(s.net);
  const standing =
    net > 0 ? "you're owed" : net < 0 ? "you owe" : "you're even";
  const sym = symbolFor(s.currency);
  const focal = net > 0 ? `+${s.net}` : s.net;

  return (
    <div
      style={{
        position: "relative",
        borderRadius: "var(--r-xl)",
        padding: 20,
        minHeight: 184,
        overflow: "hidden",
        color: "#F5F5F4",
        background:
          "linear-gradient(135deg, color-mix(in srgb, var(--accent) 92%, #000) 0%, color-mix(in srgb, var(--accent) 42%, var(--surface)) 48%, var(--surface) 100%)",
        border: "1px solid var(--border-strong)",
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
      }}
    >
      {/* soft scrim for focal-number legibility on the lighter end */}
      <div
        aria-hidden
        style={{
          position: "absolute",
          inset: 0,
          background:
            "radial-gradient(120% 80% at 0% 0%, rgba(0,0,0,0.28) 0%, transparent 60%)",
          pointerEvents: "none",
        }}
      />

      {/* top row: issuer + chip */}
      <div
        style={{
          position: "relative",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-start",
        }}
      >
        <span className="t-label" style={{ opacity: 0.85 }}>
          Jemaw
        </span>
        <Chip />
      </div>

      {/* focal: net */}
      <div style={{ position: "relative" }}>
        <div
          className="t-caption"
          style={{ opacity: 0.8, marginBottom: 2, letterSpacing: "0.04em", textTransform: "uppercase" }}
        >
          {standing}
        </div>
        <div className="t-display" style={{ lineHeight: 1 }}>
          <AnimatedNumber value={focal} prefix={sym} />
        </div>
      </div>

      {/* bottom: cardholder + stats */}
      <div
        style={{
          position: "relative",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-end",
          gap: 12,
        }}
      >
        <span
          className="t-label"
          style={{ textTransform: "uppercase", letterSpacing: "0.08em", opacity: 0.92 }}
        >
          {s.displayName}
        </span>
        <div style={{ display: "flex", gap: 16 }}>
          <Stat label="Paid" value={`${sym}${s.totalPaid}`} />
          <Stat label="Share" value={`${sym}${s.totalShare}`} />
          <Stat label="Items" value={String(s.expenseCount)} />
        </div>
      </div>
    </div>
  );
}

function Chip() {
  return (
    <div
      aria-hidden
      style={{
        width: 34,
        height: 26,
        borderRadius: 5,
        background: "linear-gradient(135deg, #E8D27A, #C9A227)",
        position: "relative",
        opacity: 0.95,
      }}
    >
      <div
        style={{
          position: "absolute",
          inset: "6px 8px",
          borderRadius: 2,
          border: "1px solid rgba(0,0,0,0.25)",
        }}
      />
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ textAlign: "right" }}>
      <div className="tnum t-label" style={{ fontVariantNumeric: "tabular-nums" }}>
        {value}
      </div>
      <div className="t-caption" style={{ opacity: 0.75 }}>
        {label}
      </div>
    </div>
  );
}
