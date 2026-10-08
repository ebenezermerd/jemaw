/**
 * Dismissible alert banner — a styled card for surfacing an error (or other
 * notice) at the top of a form, instead of a bare inline line. Destructive tint,
 * an icon, a bold title, the detail message, an optional contextual action, and
 * a dismiss control. Mirrors the primitives' restrained look (borders + tinted
 * background, single accent, no shadows).
 */
import type { ReactNode } from "react";

export type AlertTone = "error" | "warn" | "info";

const TONE: Record<AlertTone, { color: string; icon: string }> = {
  error: { color: "var(--danger, #e53e3e)", icon: "⚠" },
  warn: { color: "var(--warn, #d69e2e)", icon: "⚠" },
  info: { color: "var(--accent)", icon: "ℹ" },
};

export function AlertBanner({
  tone = "error",
  title,
  message,
  action,
  onDismiss,
}: {
  tone?: AlertTone;
  title: string;
  message: ReactNode;
  /** Optional contextual action button (e.g. "View suggestions"). */
  action?: { label: string; onClick: () => void };
  onDismiss?: () => void;
}) {
  const { color, icon } = TONE[tone];
  return (
    <div
      role="alert"
      style={{
        display: "flex",
        gap: 11,
        padding: "13px 14px",
        borderRadius: "var(--r-lg, 14px)",
        border: `1px solid color-mix(in srgb, ${color} 45%, transparent)`,
        background: `color-mix(in srgb, ${color} 12%, var(--surface))`,
      }}
    >
      <span aria-hidden style={{ color, fontSize: 18, lineHeight: "20px", flexShrink: 0 }}>
        {icon}
      </span>
      <div style={{ flex: 1, minWidth: 0, display: "grid", gap: 3 }}>
        <span style={{ fontSize: 13, fontWeight: 700, color }}>{title}</span>
        <span className="t-caption" style={{ color: "var(--text)", lineHeight: 1.4 }}>
          {message}
        </span>
        {action && (
          <button
            onClick={action.onClick}
            style={{
              marginTop: 6,
              alignSelf: "start",
              border: `1px solid color-mix(in srgb, ${color} 50%, transparent)`,
              background: "transparent",
              color,
              borderRadius: "var(--r-sm, 9px)",
              padding: "6px 12px",
              fontSize: 12,
              fontWeight: 700,
              cursor: "pointer",
            }}
          >
            {action.label}
          </button>
        )}
      </div>
      {onDismiss && (
        <button
          aria-label="Dismiss"
          onClick={onDismiss}
          style={{
            flexShrink: 0,
            border: "none",
            background: "transparent",
            color: "var(--text-muted)",
            cursor: "pointer",
            fontSize: 18,
            lineHeight: "18px",
            padding: 0,
            width: 20,
            height: 20,
          }}
        >
          ✕
        </button>
      )}
    </div>
  );
}
