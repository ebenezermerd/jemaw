/**
 * Loading states, matching the mini app: the three-arc Jemaw spinner and the
 * shimmer skeleton. Reduced motion is honoured in CSS (.jx-anim).
 */
import type { CSSProperties, ReactNode } from "react";

export function Loader({ size = 44 }: { size?: number }) {
  const stroke = Math.max(2, Math.round(size / 14));
  return (
    <div role="status" aria-label="Loading" className="jx-anim" style={{ width: size, height: size, flex: "none" }}>
      <svg width={size} height={size} viewBox="0 0 44 44" fill="none">
        <circle cx="22" cy="22" r="18" stroke="var(--border-strong)" strokeWidth={stroke} />
        <circle
          cx="22"
          cy="22"
          r="18"
          stroke="var(--accent)"
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray="28 200"
          style={{ animation: "jemaw-spin 1s linear infinite", transformOrigin: "center" }}
        />
        <circle
          cx="22"
          cy="22"
          r="11"
          stroke="rgba(168,156,227,0.7)"
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray="14 120"
          style={{ animation: "jemaw-spin-rev 0.8s linear infinite", transformOrigin: "center" }}
        />
        <circle cx="22" cy="22" r="3" fill="var(--violet-300)" style={{ animation: "jemaw-core 1.2s ease-in-out infinite" }} />
      </svg>
    </div>
  );
}

/** Centered loader for a whole page or panel. */
export function PageLoader({ label, minHeight = "50vh" }: { label?: string; minHeight?: CSSProperties["minHeight"] }) {
  return (
    <div style={{ minHeight, display: "grid", placeItems: "center", gap: 12, gridAutoRows: "min-content", justifyItems: "center", alignContent: "center" }}>
      <Loader />
      {label && <span style={{ fontSize: 12, color: "var(--text-dim)" }}>{label}</span>}
    </div>
  );
}

export function Skeleton({
  height = 56,
  width = "100%",
  radius = 12,
  style,
}: {
  height?: number;
  width?: CSSProperties["width"];
  radius?: number | string;
  style?: CSSProperties;
}) {
  return (
    <div
      aria-hidden
      className="jx-anim"
      data-testid="skeleton"
      style={{
        height,
        width,
        borderRadius: radius,
        background: "linear-gradient(90deg, var(--skeleton-base) 0%, var(--skeleton-hi) 50%, var(--skeleton-base) 100%)",
        backgroundSize: "200% 100%",
        animation: "jemaw-shimmer 1.2s linear infinite",
        ...style,
      }}
    />
  );
}

export function SkeletonList({ count = 3, height = 56, gap = 8, padding = 16 }: { count?: number; height?: number; gap?: number; padding?: number }) {
  return (
    <div role="status" aria-label="Loading" style={{ display: "grid", gap, padding }}>
      {Array.from({ length: count }, (_, i) => (
        <Skeleton key={i} height={height} />
      ))}
    </div>
  );
}

/** Placeholder rows for a CSS-grid table: one bar per column. */
export function SkeletonRows({ count = 8, cols, rowPadding = "15px 20px" }: { count?: number; cols: string; rowPadding?: string }) {
  const n = cols.trim().split(/\s+/).length;
  return (
    <div role="status" aria-label="Loading">
      {Array.from({ length: count }, (_, r) => (
        <div key={r} style={{ display: "grid", gridTemplateColumns: cols, gap: 12, alignItems: "center", padding: rowPadding, borderTop: "1px solid rgba(255,255,255,.05)" }}>
          {Array.from({ length: n }, (_, c) => (
            <Skeleton key={c} height={c === 0 ? 30 : 12} width={c === 0 ? "85%" : `${55 + ((r * 7 + c * 13) % 35)}%`} radius={c === 0 ? 9 : 6} />
          ))}
        </div>
      ))}
    </div>
  );
}

/**
 * Wraps a list that is refetching (new page or filters): a sweeping accent bar
 * on top and the old rows dimmed until the new ones land.
 */
export function Busy({ busy, children }: { busy: boolean; children: ReactNode }) {
  return (
    <div style={{ position: "relative" }} aria-busy={busy}>
      {busy && (
        <div className="jx-anim" style={{ position: "absolute", top: 0, left: 0, right: 0, height: 2, overflow: "hidden", zIndex: 2 }}>
          <div style={{ width: "40%", height: "100%", background: "linear-gradient(90deg, transparent, var(--accent-soft), transparent)", animation: "jemaw-bar 1s ease-in-out infinite" }} />
        </div>
      )}
      <div style={{ opacity: busy ? 0.5 : 1, transition: "opacity .15s", pointerEvents: busy ? "none" : undefined }}>{children}</div>
    </div>
  );
}
