/**
 * Personal balance card for Home — pixel-faithful to the Hi-Fi "premium balance
 * card": violet gradient, specular highlight, the bubble-logo watermark, a name
 * pill + gold chip, semantic status pill, the focal net in Bricolage, and a
 * three-column stat row. Net standing is the focal number.
 */
import { AnimatedNumber } from "../motion/AnimatedNumber.js";
import { currencyAffix, formatNumber } from "../lib/money.js";
import { formatDisplayName } from "../lib/names.js";
import type { MeSummaryDto } from "@jemaw/shared/types";

export function SummaryCard({ s }: { s: MeSummaryDto }) {
  const net = Number(s.net);
  const standing =
    net > 0 ? "you're owed" : net < 0 ? "you owe" : "you're all square";
  // Semantic status sub-pill: teal owed, amber owes, neutral even.
  const status =
    net > 0
      ? { color: "#bff3e2", bg: "rgba(45,212,167,.24)", glyph: "▲", word: "net positive" }
      : net < 0
        ? { color: "#fbe0bd", bg: "rgba(240,166,64,.24)", glyph: "▼", word: "net negative" }
        : { color: "rgba(255,255,255,.8)", bg: "rgba(255,255,255,.16)", glyph: "•", word: "all square" };
  const { symbol, suffix } = currencyAffix(s.currency);
  const focal = net > 0 ? `+${formatNumber(s.net)}` : formatNumber(s.net);

  return (
    <div
      style={{
        position: "relative",
        borderRadius: 26,
        padding: 15,
        overflow: "hidden",
        color: "#fff",
        background:
          "linear-gradient(145deg,#3B2C84 0%,#6E59C7 58%,#8A78D6 100%)",
        boxShadow:
          "0 24px 50px -18px rgba(110,89,199,.6), inset 0 1px 0 rgba(255,255,255,.2)",
      }}
    >
      {/* specular highlight */}
      <div
        aria-hidden
        style={{
          position: "absolute",
          inset: 0,
          background:
            "radial-gradient(150px 110px at 84% 4%, rgba(255,255,255,.26), transparent 70%)",
          pointerEvents: "none",
        }}
      />
      {/* bubble-logo watermark, bottom-right */}
      <svg
        aria-hidden
        viewBox="0 0 100 100"
        style={{
          position: "absolute",
          right: -28,
          bottom: -34,
          width: 180,
          height: 180,
          opacity: 0.16,
          pointerEvents: "none",
        }}
      >
        <circle cx="50" cy="40" r="23" fill="#fff" style={{ mixBlendMode: "overlay" }} />
        <circle cx="37" cy="62" r="23" fill="#fff" style={{ mixBlendMode: "overlay" }} />
        <circle cx="63" cy="62" r="23" fill="#fff" style={{ mixBlendMode: "overlay" }} />
      </svg>

      <div style={{ position: "relative" }}>
        {/* name pill + gold chip */}
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "flex-start",
          }}
        >
          <span
            style={{
              fontSize: 10,
              fontWeight: 700,
              letterSpacing: "0.08em",
              textTransform: "uppercase",
              color: "#fff",
              background: "rgba(255,255,255,.16)",
              padding: "5px 11px",
              borderRadius: 999,
            }}
          >
            {formatDisplayName(s.displayName)}
          </span>
          <Chip />
        </div>

        {/* status label + sub-pill */}
        <div
          style={{
            marginTop: 12,
            display: "flex",
            alignItems: "center",
            gap: 8,
          }}
        >
          <span
            style={{
              fontSize: 11,
              fontWeight: 700,
              letterSpacing: "0.1em",
              textTransform: "uppercase",
              color: "rgba(255,255,255,.82)",
            }}
          >
            {standing}
          </span>
          <span
            style={{
              fontSize: 10,
              color: status.color,
              background: status.bg,
              padding: "2px 8px",
              borderRadius: 6,
              fontWeight: 700,
            }}
          >
            {status.glyph} {status.word}
          </span>
        </div>

        {/* focal net */}
        <div
          style={{
            fontFamily: "'Bricolage Grotesque', sans-serif",
            fontWeight: 800,
            fontSize: 42,
            letterSpacing: "-0.02em",
            color: "#fff",
            marginTop: 5,
            fontVariantNumeric: "tabular-nums",
            display: "flex",
            alignItems: "baseline",
            gap: 0,
          }}
        >
          <AnimatedNumber
            value={focal}
            prefix={suffix ? "" : symbol}
            suffix=""
          />
          {suffix && (
            <span style={{ fontSize: 21, opacity: 0.7 }}>&nbsp;{symbol}</span>
          )}
        </div>

        {/* divider */}
        <div
          style={{ height: 1, background: "rgba(255,255,255,.2)", margin: "11px 0 10px" }}
        />

        {/* stat row */}
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            fontVariantNumeric: "tabular-nums",
          }}
        >
          <Stat label="Paid" value={formatNumber(s.totalPaid)} />
          <Stat label="Your share" value={formatNumber(s.totalShare)} />
          <Stat label="Entries" value={String(s.expenseCount)} />
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div style={{ fontSize: 14, fontWeight: 700, color: "#fff", lineHeight: 1.1 }}>
        {value}
      </div>
      <div style={{ fontSize: 10, color: "rgba(255,255,255,.6)", marginTop: -2 }}>
        {label}
      </div>
    </div>
  );
}

function Chip() {
  return (
    <div
      aria-hidden
      style={{
        width: 38,
        height: 28,
        borderRadius: 7,
        background: "linear-gradient(135deg,#E9C36B,#C99A3E)",
        boxShadow: "inset 0 1px 1px rgba(255,255,255,.5)",
        position: "relative",
      }}
    >
      <div
        style={{
          position: "absolute",
          inset: "5px 7px",
          border: "1px solid rgba(0,0,0,.22)",
          borderRadius: 2,
        }}
      />
    </div>
  );
}
