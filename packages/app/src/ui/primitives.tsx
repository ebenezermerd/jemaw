/**
 * Jemaw UI primitives — JEMAW_PLAN.md §12.10. Restrained: borders + background
 * lift instead of shadows, single-green accent, tabular numerals. Tap feedback
 * uses a CSS transform that the reduced-motion media query disables; richer
 * spring/layout motion lives in the motion/ components.
 */
import type { ButtonHTMLAttributes, ReactNode } from "react";
import { AnimatedNumber } from "../motion/AnimatedNumber.js";
import { currencyAffix, formatNumber } from "../lib/money.js";

// ─── Button ───────────────────────────────────────────────────────────
type ButtonVariant = "primary" | "ghost" | "danger";

export function Button({
  variant = "primary",
  children,
  style,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  children: ReactNode;
}) {
  const base: React.CSSProperties = {
    height: 44,
    padding: "0 20px",
    borderRadius: "var(--r-md)",
    fontSize: 14,
    fontWeight: 600,
    cursor: "pointer",
    transition: "transform var(--dur-instant) var(--ease-standard), filter var(--dur-fast)",
    border: "1px solid transparent",
  };
  const variants: Record<ButtonVariant, React.CSSProperties> = {
    primary: { background: "var(--accent)", color: "#0B0B0C", border: "none" },
    ghost: {
      background: "transparent",
      color: "var(--text)",
      borderColor: "var(--border-strong)",
    },
    danger: {
      background: "transparent",
      color: "var(--danger)",
      borderColor: "color-mix(in srgb, var(--danger) 40%, transparent)",
    },
  };
  return (
    <button
      {...rest}
      style={{ ...base, ...variants[variant], ...style }}
      onPointerDown={(e) => (e.currentTarget.style.transform = "scale(0.97)")}
      onPointerUp={(e) => (e.currentTarget.style.transform = "scale(1)")}
      onPointerLeave={(e) => (e.currentTarget.style.transform = "scale(1)")}
    >
      {children}
    </button>
  );
}

// ─── Card ─────────────────────────────────────────────────────────────
export function Card({
  children,
  onClick,
  accent,
}: {
  children: ReactNode;
  onClick?: () => void;
  accent?: "accent" | "warn";
}) {
  return (
    <div
      onClick={onClick}
      style={{
        position: "relative",
        background: "var(--surface)",
        border: "1px solid var(--border)",
        borderRadius: "var(--r-lg)",
        padding: 16,
        cursor: onClick ? "pointer" : "default",
        overflow: "hidden",
      }}
    >
      {accent && (
        <span
          style={{
            position: "absolute",
            left: 0,
            top: 0,
            bottom: 0,
            width: 4,
            background:
              accent === "accent" ? "var(--accent-soft)" : "var(--warn-soft)",
          }}
        />
      )}
      {children}
    </div>
  );
}

// ─── Avatar ───────────────────────────────────────────────────────────
export function Avatar({
  name,
  size = 32,
  photoUrl,
}: {
  name: string;
  size?: number;
  /** Telegram photo (only available for the current viewer); else initial. */
  photoUrl?: string;
}) {
  const initial = (name.trim()[0] ?? "?").toUpperCase();
  if (photoUrl) {
    return (
      <img
        src={photoUrl}
        alt={name}
        width={size}
        height={size}
        style={{
          width: size,
          height: size,
          borderRadius: "var(--r-full)",
          objectFit: "cover",
          flexShrink: 0,
        }}
      />
    );
  }
  return (
    <span
      aria-hidden
      style={{
        width: size,
        height: size,
        borderRadius: "var(--r-full)",
        background: "var(--surface-elevated)",
        color: "var(--text-muted)",
        display: "inline-grid",
        placeItems: "center",
        fontSize: size * 0.42,
        fontWeight: 600,
        flexShrink: 0,
      }}
    >
      {initial}
    </span>
  );
}

// ─── Pill ─────────────────────────────────────────────────────────────
export function Pill({
  children,
  variant = "neutral",
}: {
  children: ReactNode;
  variant?: "neutral" | "accent" | "warn";
}) {
  const bg = {
    neutral: "transparent",
    accent: "var(--accent-soft)",
    warn: "var(--warn-soft)",
  }[variant];
  return (
    <span
      className="t-caption"
      style={{
        height: 24,
        padding: "0 8px",
        borderRadius: "var(--r-full)",
        background: bg,
        border: variant === "neutral" ? "1px solid var(--border)" : "none",
        display: "inline-flex",
        alignItems: "center",
        color: "var(--text-muted)",
      }}
    >
      {children}
    </span>
  );
}

// ─── Money ────────────────────────────────────────────────────────────
export function Money({
  value,
  currency,
  signed = false,
  animate = false,
}: {
  value: string; // decimal string
  currency: string;
  signed?: boolean;
  /** animate digit changes (§12.9); use for balances/settle amounts */
  animate?: boolean;
}) {
  const n = Number(value);
  const color = !signed
    ? "var(--text)"
    : n > 0
      ? "var(--accent)"
      : n < 0
        ? "var(--warn)"
        : "var(--text-muted)";
  const grouped = formatNumber(value); // thousands separators
  const display = signed && n > 0 ? `+${grouped}` : grouped;
  const { symbol, suffix } = currencyAffix(currency);

  if (animate) {
    return (
      <AnimatedNumber
        value={display}
        prefix={suffix ? "" : symbol}
        suffix={suffix ? symbol : ""}
        color={color}
      />
    );
  }
  return (
    <span className="tnum" style={{ color, fontWeight: 500 }}>
      {suffix ? `${display}${symbol}` : `${symbol}${display}`}
    </span>
  );
}
