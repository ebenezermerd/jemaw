/**
 * Personal summary card for Home — a refined credit-card surface. Focal: the
 * member's net standing. Stats (paid/share/items) live on the Balances screen,
 * not here, to keep the card clean and premium.
 */
import { AnimatedNumber } from "../motion/AnimatedNumber.js";
import { currencyAffix } from "../lib/money.js";
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
        minHeight: 196,
        overflow: "hidden",
        color: "#F7F7F5",
        background:
          "linear-gradient(135deg, color-mix(in srgb, var(--accent) 88%, #000) 0%, color-mix(in srgb, var(--accent) 38%, #0B0B0C) 52%, #101012 100%)",
        border: "1px solid var(--border-strong)",
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        boxShadow: "0 12px 32px rgba(0,0,0,0.28)",
      }}
    >
      {/* legibility scrim + subtle sheen */}
      <div
        aria-hidden
        style={{
          position: "absolute",
          inset: 0,
          background:
            "radial-gradient(130% 90% at 100% 0%, rgba(255,255,255,0.10) 0%, transparent 45%), radial-gradient(120% 80% at 0% 100%, rgba(0,0,0,0.32) 0%, transparent 55%)",
          pointerEvents: "none",
        }}
      />

      {/* top: issuer + chip */}
      <div
        style={{
          position: "relative",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-start",
        }}
      >
        <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
          <span
            className="t-label"
            style={{ letterSpacing: "0.12em", opacity: 0.9 }}
          >
            JEMAW
          </span>
          <span className="t-caption" style={{ opacity: 0.7 }}>
            group balance
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

      {/* bottom: cardholder (with photo if available) */}
      <div
        style={{
          position: "relative",
          display: "flex",
          alignItems: "center",
          gap: 10,
        }}
      >
        {photo ? (
          <img
            src={photo}
            alt=""
            width={28}
            height={28}
            style={{
              width: 28,
              height: 28,
              borderRadius: "var(--r-full)",
              objectFit: "cover",
              border: "1px solid rgba(255,255,255,0.4)",
            }}
          />
        ) : null}
        <span
          className="t-label"
          style={{
            textTransform: "uppercase",
            letterSpacing: "0.1em",
            opacity: 0.95,
          }}
        >
          {s.displayName}
        </span>
      </div>
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
