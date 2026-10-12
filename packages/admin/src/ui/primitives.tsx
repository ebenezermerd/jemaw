import type { CSSProperties, ReactNode } from "react";

export function Card({
  children,
  style,
  className,
}: {
  children: ReactNode;
  style?: CSSProperties;
  className?: string;
}) {
  return (
    <div
      className={className}
      style={{
        background: "var(--surface)",
        border: "1px solid var(--hairline)",
        borderRadius: "var(--radius)",
        padding: 20,
        ...style,
      }}
    >
      {children}
    </div>
  );
}

const STATUS_COLORS: Record<string, { fg: string; bg: string }> = {
  active: { fg: "var(--on-success)", bg: "rgba(45,212,167,.12)" },
  idle: { fg: "var(--on-warn)", bg: "rgba(224,178,60,.14)" },
  new: { fg: "var(--on-accent)", bg: "rgba(110,89,199,.16)" },
  suspended: { fg: "var(--text-dim)", bg: "var(--hairline)" },
  flagged: { fg: "var(--on-danger)", bg: "rgba(242,104,95,.12)" },
  sent: { fg: "var(--on-success)", bg: "rgba(45,212,167,.12)" },
  queued: { fg: "var(--on-warn)", bg: "rgba(224,178,60,.14)" },
  sending: { fg: "var(--on-info)", bg: "rgba(91,168,224,.12)" },
  draft: { fg: "var(--on-accent)", bg: "rgba(110,89,199,.18)" },
  failed: { fg: "var(--on-danger)", bg: "rgba(242,104,95,.12)" },
};

export function StatusPill({ status }: { status: string }) {
  const c = STATUS_COLORS[status] ?? { fg: "var(--on-accent)", bg: "rgba(110,89,199,.18)" };
  return (
    <span
      style={{
        fontSize: 11,
        fontWeight: 700,
        color: c.fg,
        background: c.bg,
        padding: "3px 10px",
        borderRadius: 7,
        textTransform: "capitalize",
        // Hug the label even as a direct grid or flex child, where it would stretch.
        display: "inline-block",
        width: "fit-content",
        justifySelf: "start",
        alignSelf: "center",
        whiteSpace: "nowrap",
        lineHeight: 1.4,
      }}
    >
      {status}
    </span>
  );
}

export function SectionLabel({ children }: { children: ReactNode }) {
  return (
    <div
      style={{
        fontFamily: "var(--font-mono)",
        fontSize: 10,
        letterSpacing: ".14em",
        textTransform: "uppercase",
        color: "var(--text-faint)",
      }}
    >
      {children}
    </div>
  );
}

export function PrimaryButton({
  children,
  onClick,
  disabled,
  type = "button",
}: {
  children: ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  type?: "button" | "submit";
}) {
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      style={{
        background: "var(--accent)",
        border: "none",
        borderRadius: 12,
        padding: "12px 16px",
        fontSize: 15,
        fontWeight: 700,
        color: "#fff",
        cursor: disabled ? "default" : "pointer",
        opacity: disabled ? 0.6 : 1,
        boxShadow: "var(--accent-glow)",
      }}
    >
      {children}
    </button>
  );
}

export function Avatar({ label }: { label: string }) {
  return (
    <div
      style={{
        width: 36,
        height: 36,
        borderRadius: 10,
        background: "linear-gradient(140deg,#6E59C7,#A99CE3)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontWeight: 700,
        fontSize: 14,
        flex: "none",
      }}
    >
      {label.charAt(0).toUpperCase()}
    </div>
  );
}

export function CenteredMessage({ children }: { children: ReactNode }) {
  return (
    <div
      style={{
        padding: 48,
        textAlign: "center",
        color: "var(--text-dim)",
        fontSize: 14,
      }}
    >
      {children}
    </div>
  );
}

/**
 * Keeps a grid table readable on small screens: the columns hold their widths
 * and the table scrolls sideways instead of crushing every cell.
 */
export function TableScroll({ min, children }: { min: number; children: ReactNode }) {
  return (
    <div className="jx-scroll" style={{ overflowX: "auto", WebkitOverflowScrolling: "touch" }}>
      <div style={{ minWidth: min }}>{children}</div>
    </div>
  );
}
