/** Centered modal with a blurred backdrop. Escape and backdrop clicks close it. */
import { useEffect, type ReactNode } from "react";

export function Dialog({
  title,
  subtitle,
  onClose,
  children,
  footer,
  width = 480,
  tone = "default",
}: {
  title: string;
  subtitle?: string;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  width?: number;
  tone?: "default" | "danger";
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <>
      <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(7,7,11,.72)", backdropFilter: "blur(4px)", zIndex: 1000 }} />
      <div
        role="dialog"
        aria-label={title}
        style={{
          position: "fixed",
          top: "50%",
          left: "50%",
          transform: "translate(-50%,-50%)",
          width: `min(${width}px, calc(100vw - 32px))`,
          maxHeight: "calc(100vh - 48px)",
          overflow: "auto",
          background: "var(--surface)",
          border: `1px solid ${tone === "danger" ? "rgba(242,104,95,.35)" : "var(--hairline-2)"}`,
          borderRadius: 20,
          zIndex: 1001,
          boxShadow: "0 32px 80px -16px rgba(0,0,0,.7)",
        }}
      >
        <div style={{ padding: "18px 22px", borderBottom: "1px solid var(--hairline)", display: "flex", alignItems: "flex-start", gap: 12 }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 16, fontWeight: 700, color: tone === "danger" ? "var(--danger)" : "var(--text)" }}>{title}</div>
            {subtitle && <div style={{ fontSize: 12.5, color: "var(--text-dim)", marginTop: 3 }}>{subtitle}</div>}
          </div>
          <button onClick={onClose} aria-label="Close" style={{ background: "transparent", border: "none", color: "var(--text-dim)", fontSize: 20, cursor: "pointer", lineHeight: 1 }}>
            ×
          </button>
        </div>
        <div style={{ padding: 22, display: "flex", flexDirection: "column", gap: 12 }}>{children}</div>
        {footer && <div style={{ padding: "14px 22px", borderTop: "1px solid var(--hairline)", display: "flex", justifyContent: "flex-end", gap: 10 }}>{footer}</div>}
      </div>
    </>
  );
}

export function GhostButton({ children, onClick, disabled, tone = "default" }: { children: ReactNode; onClick?: () => void; disabled?: boolean; tone?: "default" | "danger" }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        background: tone === "danger" ? "rgba(242,104,95,.1)" : "transparent",
        border: `1px solid ${tone === "danger" ? "rgba(242,104,95,.4)" : "var(--hairline-2)"}`,
        borderRadius: 10,
        padding: "9px 14px",
        fontSize: 13,
        fontWeight: 600,
        color: tone === "danger" ? "var(--danger)" : "var(--text)",
        cursor: disabled ? "default" : "pointer",
        opacity: disabled ? 0.5 : 1,
        whiteSpace: "nowrap",
      }}
    >
      {children}
    </button>
  );
}

/**
 * A native select pins its own arrow to the border edge whatever the padding
 * is, so the console draws the chevron itself and leaves room for it.
 */
export const selectStyle = {
  width: "100%",
  backgroundColor: "var(--bg-panel)",
  backgroundImage: "var(--select-chevron)",
  backgroundRepeat: "no-repeat",
  backgroundPosition: "right 11px center",
  backgroundSize: "15px 15px",
  appearance: "none",
  WebkitAppearance: "none",
  border: "1px solid var(--hairline-2)",
  borderRadius: 10,
  padding: "10px 34px 10px 12px",
  fontSize: 14,
  color: "var(--text)",
  outline: "none",
  cursor: "pointer",
} as const;

export const fieldStyle = {
  width: "100%",
  background: "var(--bg-panel)",
  border: "1px solid var(--hairline-2)",
  borderRadius: 10,
  padding: "10px 12px",
  fontSize: 14,
  color: "var(--text)",
  outline: "none",
} as const;
