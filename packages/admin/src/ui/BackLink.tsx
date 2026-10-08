/**
 * Context-aware back navigation. A page that links into a detail view passes
 * `state: { from: { path, label } }`; the detail's back link returns there,
 * or to the section list when opened directly.
 */
import { useLocation, useNavigate } from "react-router-dom";

export interface BackTo {
  path: string;
  label: string;
}

export function fromState(path: string, label: string): { state: { from: BackTo } } {
  return { state: { from: { path, label } } };
}

export function useBackTo(fallback: BackTo): BackTo {
  const loc = useLocation();
  return (loc.state as { from?: BackTo } | null)?.from ?? fallback;
}

export function BackLink({ to }: { to: BackTo }) {
  const navigate = useNavigate();
  return (
    <button
      onClick={() => navigate(to.path)}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 7,
        fontSize: 13,
        fontWeight: 600,
        color: "#A99CE3",
        background: "none",
        border: "none",
        cursor: "pointer",
        padding: 0,
        marginBottom: 16,
      }}
    >
      <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M15 18l-6-6 6-6" />
      </svg>
      {to.label}
    </button>
  );
}
