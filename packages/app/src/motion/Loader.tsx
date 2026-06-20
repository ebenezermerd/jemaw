/**
 * Jemaw loader — a distinctive branded spinner. Three accent arcs rotate at
 * different speeds inside each other, with a soft pulsing core. On-brand, not a
 * generic spinner. Respects reduced motion (static ring).
 */
import { useReducedMotion } from "./useReducedMotion.js";

export function Loader({ size = 44 }: { size?: number }) {
  const reduced = useReducedMotion();
  const s = size;
  const stroke = Math.max(2, Math.round(size / 14));

  return (
    <div
      role="status"
      aria-label="Loading"
      style={{ width: s, height: s, position: "relative" }}
    >
      <svg width={s} height={s} viewBox="0 0 44 44" fill="none">
        {/* faint track */}
        <circle cx="22" cy="22" r="18" stroke="var(--border-strong)" strokeWidth={stroke} />
        {/* outer arc */}
        <circle
          cx="22"
          cy="22"
          r="18"
          stroke="var(--accent)"
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray="28 200"
          style={
            reduced
              ? undefined
              : { animation: "jemaw-spin 1s linear infinite", transformOrigin: "center" }
          }
        />
        {/* inner counter-arc (violet-300, per Hi-Fi loader) */}
        <circle
          cx="22"
          cy="22"
          r="11"
          stroke="rgba(168,156,227,0.7)"
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray="14 120"
          style={
            reduced
              ? undefined
              : { animation: "jemaw-spin-rev 0.8s linear infinite", transformOrigin: "center" }
          }
        />
        {/* pulsing core */}
        <circle
          cx="22"
          cy="22"
          r="3"
          fill="var(--violet-300)"
          style={reduced ? undefined : { animation: "jemaw-core 1.2s ease-in-out infinite" }}
        />
      </svg>
      <style>{`
        @keyframes jemaw-spin { to { transform: rotate(360deg) } }
        @keyframes jemaw-spin-rev { to { transform: rotate(-360deg) } }
        @keyframes jemaw-core { 0%,100% { opacity: 0.4; r: 3 } 50% { opacity: 1; r: 4 } }
      `}</style>
    </div>
  );
}

/** Centered full-area loader for page loading states. */
export function PageLoader({ label }: { label?: string }) {
  return (
    <div
      style={{
        minHeight: "50vh",
        display: "grid",
        placeItems: "center",
        gap: 12,
        gridAutoRows: "min-content",
        justifyItems: "center",
      }}
    >
      <Loader />
      {label && (
        <span className="t-caption" style={{ color: "var(--text-muted)" }}>
          {label}
        </span>
      )}
    </div>
  );
}
