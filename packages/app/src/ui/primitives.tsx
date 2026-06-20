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
    primary: { background: "var(--accent)", color: "#fff", border: "none" },
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
  variant = "plain",
  style,
}: {
  children: ReactNode;
  onClick?: () => void;
  /** thin left status bar (semantic) */
  accent?: "accent" | "warn" | "positive";
  /** plain surface or the glassy violet-bloom hero surface */
  variant?: "plain" | "glass";
  style?: React.CSSProperties;
}) {
  const accentColor =
    accent === "positive"
      ? "var(--positive)"
      : accent === "warn"
        ? "var(--warn)"
        : "var(--accent)";
  return (
    <div
      onClick={onClick}
      style={{
        position: "relative",
        background:
          variant === "glass"
            ? "linear-gradient(150deg, var(--surface-elevated), var(--surface))"
            : "var(--surface)",
        border: "1px solid var(--border)",
        borderRadius: "var(--r-lg)",
        padding: 16,
        cursor: onClick ? "pointer" : "default",
        overflow: "hidden",
        boxShadow:
          variant === "glass"
            ? "inset 0 1px 0 rgba(255,255,255,0.06)"
            : undefined,
        ...style,
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
            background: accentColor,
            opacity: 0.9,
          }}
        />
      )}
      {children}
    </div>
  );
}

// ─── Avatar ───────────────────────────────────────────────────────────
/** Deterministic member gradient (Jemaw Brand.dc.html uses tinted avatar
 * gradients). Stable per name so the same member always reads the same. */
const AVATAR_GRADIENTS = [
  "linear-gradient(140deg, #463494, #8a78d6)",
  "linear-gradient(140deg, #1c5e4b, #2dd4a7)",
  "linear-gradient(140deg, #234c7a, #5ba8e0)",
  "linear-gradient(140deg, #7a5a1c, #e0b23c)",
  "linear-gradient(140deg, #7a3a1c, #e8825c)",
  "linear-gradient(140deg, #6a2a55, #d873b8)",
];

function avatarGradient(name: string): string {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  return (
    AVATAR_GRADIENTS[h % AVATAR_GRADIENTS.length] ??
    "linear-gradient(140deg, #463494, #8a78d6)"
  );
}

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
        background: avatarGradient(name),
        color: "#fff",
        display: "inline-grid",
        placeItems: "center",
        fontSize: size * 0.42,
        fontWeight: 700,
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
  variant?: "neutral" | "accent" | "positive" | "warn";
}) {
  const tone: Record<
    "neutral" | "accent" | "positive" | "warn",
    { bg: string; fg: string }
  > = {
    neutral: { bg: "transparent", fg: "var(--text-muted)" },
    accent: { bg: "var(--accent-soft)", fg: "var(--accent)" },
    positive: { bg: "var(--positive-soft)", fg: "var(--positive)" },
    warn: { bg: "var(--warn-soft)", fg: "var(--warn)" },
  };
  const { bg, fg } = tone[variant];
  return (
    <span
      className="t-caption"
      style={{
        height: 24,
        padding: "0 9px",
        borderRadius: "var(--r-full)",
        background: bg,
        border: variant === "neutral" ? "1px solid var(--border)" : "none",
        display: "inline-flex",
        alignItems: "center",
        gap: 4,
        fontWeight: 700,
        color: fg,
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
      ? "var(--positive)"
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
