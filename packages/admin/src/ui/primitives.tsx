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
  active: { fg: "#2DD4A7", bg: "rgba(45,212,167,.12)" },
  idle: { fg: "#E0B23C", bg: "rgba(224,178,60,.12)" },
  new: { fg: "#5BA8E0", bg: "rgba(91,168,224,.12)" },
  suspended: { fg: "#F2685F", bg: "rgba(242,104,95,.12)" },
  sent: { fg: "#2DD4A7", bg: "rgba(45,212,167,.12)" },
  queued: { fg: "#E0B23C", bg: "rgba(224,178,60,.12)" },
  sending: { fg: "#5BA8E0", bg: "rgba(91,168,224,.12)" },
  draft: { fg: "#A99CE3", bg: "rgba(110,89,199,.18)" },
  failed: { fg: "#F2685F", bg: "rgba(242,104,95,.12)" },
};

export function StatusPill({ status }: { status: string }) {
  const c = STATUS_COLORS[status] ?? { fg: "var(--accent-soft)", bg: "rgba(110,89,199,.18)" };
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
        color: "rgba(244,242,251,.4)",
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
        boxShadow: "0 12px 30px -10px rgba(110,89,199,.7)",
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
