/**
 * Consistent empty state: a soft icon container + secondary-colored text.
 * Used wherever a list or screen has nothing to show.
 */
import type { ReactNode } from "react";

export function EmptyState({
  icon,
  title,
  hint,
  compact = false,
}: {
  /** glyph or small node shown in the rounded container */
  icon: ReactNode;
  title: string;
  hint?: string;
  /** compact = inline within a card/list; else centered in the viewport */
  compact?: boolean;
}) {
  const body = (
    <div
      style={{
        display: "grid",
        justifyItems: "center",
        gap: 10,
        textAlign: "center",
        padding: compact ? "24px 16px" : 0,
      }}
    >
      <div
        aria-hidden
        style={{
          width: 56,
          height: 56,
          borderRadius: "var(--r-lg)",
          background: "var(--surface-elevated)",
          display: "grid",
          placeItems: "center",
          fontSize: 26,
          color: "var(--text-faint)",
        }}
      >
        {icon}
      </div>
      <div className="t-body-strong" style={{ color: "var(--text-muted)" }}>
        {title}
      </div>
      {hint && (
        <div className="t-caption" style={{ color: "var(--text-faint)", maxWidth: 260 }}>
          {hint}
        </div>
      )}
    </div>
  );

  if (compact) return body;
  return (
    <div style={{ minHeight: "52vh", display: "grid", placeItems: "center" }}>
      {body}
    </div>
  );
}
